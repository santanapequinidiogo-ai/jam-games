import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const CONFIG = {
    ROAD_WIDTH: 24, 
    LANES: 4,
    SAFE_DISTANCE: 25, 
    SPEED_LIMIT: 100, 
    ACCEL: 0.25,
    BRAKE: 0.5, // Revertido para o freio suave
    HANDBRAKE: 2.5, // Nova mecânica de freio de mão (forte)
    MAX_SPEED: 1.5,
    TURN_SPEED: 0.15 
};

const TIPS = [
    { title: "BRAKING DISTANCE", text: "At 80km/h, your braking distance doubles compared to 40km/h. Keep a safe distance." },
    { title: "WET ROAD", text: "Under rain, friction reduces by up to 50%. Your steering ability is severely affected." },
    { title: "BLIND SPOT", text: "In the 3D simulator, remember: what's right behind or beside you may be invisible without mirrors." }
];

class Car {
    constructor(scene, color, isPlayer = false) {
        this.group = new THREE.Group();
        
        const isSUV = !isPlayer && Math.random() > 0.7;
        const carH = isSUV ? 1.2 : 0.8;
        const cabinH = isSUV ? 0.8 : 0.6;
        const carW = isSUV ? 2.2 : 2.0;

        // Corpo
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(carW, carH, 4),
            new THREE.MeshStandardMaterial({ color: color, metalness: 0.8, roughness: 0.2 })
        );
        body.position.y = 0.8;
        body.castShadow = true;
        this.group.add(body);

        // Cabine
        const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(carW * 0.9, cabinH, 2.2),
            new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100 })
        );
        cabin.position.set(0, carH/2 + 0.8 + cabinH/2, 0.2);
        this.group.add(cabin);

        // Rodas
        this.wheels = [];
        const wGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12);
        const wMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        // [-X, Y, -Z] são as frontais no nosso sistema (Headlights estão em -2)
        const wPos = [
            [-carW/2-0.1, 0.4, 1.2], [carW/2+0.1, 0.4, 1.2], // Traseiras
            [-carW/2-0.1, 0.4, -1.2], [carW/2+0.1, 0.4, -1.2] // Frontais
        ];
        wPos.forEach(p => {
            const w = new THREE.Mesh(wGeo, wMat);
            w.rotation.z = Math.PI/2;
            w.position.set(...p);
            this.group.add(w);
            this.wheels.push(w);
        });

        // Luzes
        const lGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const fMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Frontal
        const tMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.2 }); // Traseira (preparada para acender)
        
        const f1 = new THREE.Mesh(lGeo, fMat); f1.position.set(-carW/2+0.4, carH/2+0.6, -2);
        const f2 = f1.clone(); f2.position.x = carW/2-0.4;
        const r1 = new THREE.Mesh(lGeo, tMat); r1.position.set(-carW/2+0.4, carH/2+0.6, 2);
        const r2 = new THREE.Mesh(lGeo, tMat.clone()); r2.position.set(carW/2-0.4, carH/2+0.6, 2);
        
        this.group.add(f1, f2, r1, r2);
        this.tailLights = [r1, r2]; // Salva as luzes traseiras para animar

        scene.add(this.group);
        this.mesh = this.group;
        this.speed = 0;
        this.pitch = 0; // Inclinação do carro (frenagem)
        this.isPlayer = isPlayer;

        // Faróis Dianteiros (Dinâmicos)
        if (isPlayer) {
            this.headlights = [];
            [-1, 1].forEach(side => {
                const sl = new THREE.SpotLight(0xffffff, 5, 120, Math.PI/5, 0.5, 1);
                sl.position.set(side * (carW/2-0.4), carH/2, -2); // 4/2 = 2
                sl.target.position.set(side * (carW/2-0.4), 0, -25);
                sl.castShadow = true;
                this.group.add(sl, sl.target);
                this.headlights.push(sl);
            });
        }
    }

    update(controls, weather) {
        if (!this.isPlayer) return;
        if (controls.up) this.speed += CONFIG.ACCEL * 0.01;
        if (controls.down) this.speed -= CONFIG.BRAKE * 0.01;
        if (controls.space) this.speed -= CONFIG.HANDBRAKE * 0.01;
        this.speed *= (weather === 'Rainy' ? 0.997 : 0.999);
        this.speed = Math.max(0, Math.min(this.speed, CONFIG.MAX_SPEED));
        
        // Steering lock when stationary
        const steerDir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        if (this.speed > 0.05) {
            this.mesh.position.x += steerDir * CONFIG.TURN_SPEED;
        }
        
        // Braking Visual Effects
        const isBraking = (controls.down || controls.space) && this.speed > 0;
        
        this.tailLights.forEach(light => {
            light.material.emissiveIntensity = isBraking ? 2.5 : 0.2; // Acende forte ao frear
        });

        // Inclinação do carro para frente ao frear (Pitch)
        const targetPitch = isBraking ? -0.05 * (this.speed) : 0;
        this.pitch += (targetPitch - this.pitch) * 0.15;
        this.mesh.rotation.x = this.pitch;

        // Wheel Animations
        const turnAngle = steerDir * 0.4;
        this.wheels[2].rotation.y += (turnAngle - this.wheels[2].rotation.y) * 0.1; // Front Left
        this.wheels[3].rotation.y += (turnAngle - this.wheels[3].rotation.y) * 0.1; // Front Right
        
        // Rolling animation
        this.wheels.forEach(w => w.rotation.x += this.speed * 0.8);
        
        const limit = (CONFIG.ROAD_WIDTH / 2) - 1.5;
        this.mesh.position.x = Math.max(-limit, Math.min(this.mesh.position.x, limit));
        this.mesh.position.z -= this.speed;
        
        const tilt = Math.min(this.speed * 5, 1);
        this.mesh.rotation.z = -((controls.right?1:0)-(controls.left?1:0)) * 0.05 * tilt;
    }
}

class Simulation {
    constructor() {
        this.container = document.getElementById('three-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510); // Céu noturno escuro
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // BLOOM SETUP
        const renderScene = new RenderPass(this.scene, this.camera);
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);

        this.traffic = [];
        this.pedestrians = [];
        this.semaphores = [];
        this.streetlights = [];
        this.powerWires = [];
        this.scenery = [];
        this.speedSigns = [];
        
        this.initLights();
        this.initEnvironment();
        
        this.player = new Car(this.scene, 0x4f46e5, true);
        
        // Traffic Cycle State
        this.lightState = 'Green'; 
        this.lightTimer = 0;
        this.yellowPenaltyApplied = false;

        this.weather = 'Sunny';
       this.weatherIntensity = 1;
        this.safeScore = 0;
        this.isPaused = true;
        this.controls = { up: false, down: false, left: false, right: false, space: false };
        this.rainParticles = null;
        this.shownViolations = new Set();
        this.shouldReload = false;
        
        // Phone Distraction System
        this.callTriggers = [500, 1500, 3800, 4300];
        this.isPhoneRinging = false;
        this.isCallActive = false;
        this.audioCtx = null;
        this.ringInterval = null;
        this.activeCallAudio = null; // Áudio da chamada ativa

        this.setupEventListeners();
        this.animate(); // Inicia o loop imediatamente para mostrar o fundo 3D
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0x223355, 0.6)); // Luz ambiente noturna azulada
        this.sunLight = new THREE.DirectionalLight(0xffaa55, 0.4); // Luz da lua / cidade difusa
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);
    }

    createAsphaltTexture() {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#111'; ctx.fillRect(0,0,512,512);
        for(let i=0; i<40000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#222' : '#000';
            ctx.fillRect(Math.random()*512, Math.random()*512, 1, 1);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 400);
        return tex;
    }

    initEnvironment() {
        // Chão base
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 4000),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
        );
        ground.rotation.x = -Math.PI/2;
        ground.position.y = -0.1;
        this.scene.add(ground);
        this.grass = ground;

        // Estrada Rica (Asfalto Molhado PBR)
        this.roadMat = new THREE.MeshStandardMaterial({ 
            color: 0x111111, 
            roughnessMap: this.createAsphaltTexture(), 
            roughness: 0.3, // Brilhante/Molhado
            metalness: 0.5 
        });
        this.road = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, 4000), this.roadMat);
        this.road.rotation.x = -Math.PI/2;
        this.road.receiveShadow = true;
        this.scene.add(this.road);

        // Calçadas (6 unidades)
        const swWidth = CONFIG.ROAD_WIDTH / 4;
        const swMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8 });
        this.leftSidewalk = new THREE.Mesh(new THREE.PlaneGeometry(swWidth, 4000), swMat);
        this.leftSidewalk.rotation.x = -Math.PI/2;
        this.leftSidewalk.position.set(-CONFIG.ROAD_WIDTH/2 - swWidth/2, 0.05, 0);
        this.scene.add(this.leftSidewalk);

        this.rightSidewalk = new THREE.Mesh(new THREE.PlaneGeometry(swWidth, 4000), swMat);
        this.rightSidewalk.rotation.x = -Math.PI/2;
        this.rightSidewalk.position.set(CONFIG.ROAD_WIDTH/2 + swWidth/2, 0.05, 0);
        this.scene.add(this.rightSidewalk);

        // Meio-fio
        const curbMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8 });
        this.leftCurb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 4000), curbMat);
        this.leftCurb.position.set(-CONFIG.ROAD_WIDTH/2 - 0.25, 0.2, 0);
        this.scene.add(this.leftCurb);

        this.rightCurb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 4000), curbMat);
        this.rightCurb.position.set(CONFIG.ROAD_WIDTH/2 + 0.25, 0.2, 0);
        this.scene.add(this.rightCurb);

        // Linhas
        this.lines = [];
        const yLine = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const wLine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
        for (let i = 0; i < 25; i++) {
            const z = -i * 20;
            const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), yLine);
            c.rotation.x = -Math.PI/2; c.position.set(0, 0.02, z);
            this.scene.add(c); this.lines.push(c);
            
            const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5), wLine);
            fl.rotation.x = -Math.PI/2; fl.position.set(-6, 0.02, z);
            this.scene.add(fl); this.lines.push(fl);
            
            const fr = fl.clone(); fr.position.x = 6;
            this.scene.add(fr); this.lines.push(fr);
        }

        this.initBuildings();
        this.initStreetlights();
        this.initSemaphores(); 
        this.initSpeedSigns();

        this.scene.fog = new THREE.FogExp2(0x050510, 0.007); // Neblina noturna escura
    }

    initSemaphores() {
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, 12);
        const boxGeo = new THREE.BoxGeometry(1.2, 3, 0.8);
        const lightGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const SPACING = 800; 
        
        for (let i = 0; i < 3; i++) {
            const z = -i * SPACING - 200;
            const group = new THREE.Group();
            
            // 1. Poste Principal
            const pole = new THREE.Mesh(poleGeo, new THREE.MeshPhongMaterial({ color: 0x334155 }));
            pole.position.y = 6;
            group.add(pole);
            
            // 2. Braço Curvado (Cantilever)
            const armPath = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, 11.5, 0),
                new THREE.Vector3(2, 12, 0),
                new THREE.Vector3(8, 11, 0),
                new THREE.Vector3(14, 10, 0)
            ]);
            const armGeo = new THREE.TubeGeometry(armPath, 20, 0.2, 8, false);
            const arm = new THREE.Mesh(armGeo, new THREE.MeshPhongMaterial({ color: 0x334155 }));
            group.add(arm);

            // 3. Caixas de Luzes (Hanging)
            const createBox = (x, y, zBox) => {
                const boxGroup = new THREE.Group();
                const box = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({ color: 0x111111 }));
                boxGroup.add(box);
                
                const offMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
                const red = new THREE.Mesh(lightGeo, offMat.clone()); red.position.set(0, 1, 0.45);
                const yellow = new THREE.Mesh(lightGeo, offMat.clone()); yellow.position.set(0, 0, 0.45);
                const green = new THREE.Mesh(lightGeo, offMat.clone()); green.position.set(0, -1, 0.45);
                boxGroup.add(red, yellow, green);
                
                boxGroup.position.set(x, y, zBox);
                return { group: boxGroup, red, yellow, green };
            };

            const b1 = createBox(0, 8, 0.6); // Na haste vertical
            const b2 = createBox(7, 11, 0);   // Meio do braço
            const b3 = createBox(13, 10, 0);  // Ponta do braço
            
            group.add(b1.group, b2.group, b3.group);
            
            // Guardamos todas as luzes para o ciclo
            group.userData = { 
                reds: [b1.red, b2.red, b3.red], 
                yellows: [b1.yellow, b2.yellow, b3.yellow], 
                greens: [b1.green, b2.green, b3.green],
                initialZ: z,
                passed: false
            };
            
            group.position.set(-14, 0, z); // Esquerda
            this.scene.add(group);
            this.semaphores.push(group);
            
            // Réplica Direita (Invertida)
            const rightGroup = group.clone();
            rightGroup.scale.x = -1;
            rightGroup.position.x = 14;
            // IMPORTANTE: O clone não copia userData corretamente para sub-objetos, reconstruímos:
            rightGroup.userData = {
                reds: [rightGroup.children[2].children[1], rightGroup.children[3].children[1], rightGroup.children[4].children[1]],
                yellows: [rightGroup.children[2].children[2], rightGroup.children[3].children[2], rightGroup.children[4].children[2]],
                greens: [rightGroup.children[2].children[3], rightGroup.children[3].children[3], rightGroup.children[4].children[3]],
                initialZ: z, passed: false
            };
            this.scene.add(rightGroup);
            this.semaphores.push(rightGroup);

            // 4. Faixa de Pedestres (Zebrada Vertical)
            const stripeGeo = new THREE.PlaneGeometry(1.5, 6);
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
            for (let s = 0; s < 8; s++) {
                const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                stripe.rotation.x = -Math.PI / 2;
                // Distribui as faixas ao longo da largura da pista (-9, -6, -3, 0, 3, 6, 9, etc)
                const posX = -10.5 + s * 3; 
                stripe.position.set(posX, 0.08, z + 8);
                this.scene.add(stripe);
                this.lines.push(stripe); // Adiciona ao pool de reciclagem
            }
        }
    }
    createWire(p1, p2) {
        const midZ = (p1.z + p2.z)/2;
        const curve = new THREE.CatmullRomCurve3([p1, new THREE.Vector3(p1.x, p1.y-2, midZ), p2]);
        const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)), new THREE.LineBasicMaterial({ color: 0x111111 }));
        this.scene.add(wire);
        this.powerWires.push({ mesh: wire, initialZ: midZ });
    }

    initBuildings() {
        this.scenery = [];
        const PER_ROW = 80;
        const SPACING = 30;

        // Textura Procedural para Janelas de Prédio
        const wC = document.createElement('canvas'); wC.width = wC.height = 256;
        const wCtx = wC.getContext('2d');
        wCtx.fillStyle = '#000'; wCtx.fillRect(0,0,256,256);
        wCtx.fillStyle = '#fef08a'; // Cor de luz de janela
        for(let py=10; py<256; py+=30) {
            for(let px=10; px<256; px+=30) {
                if(Math.random() > 0.6) wCtx.fillRect(px,py,15,20); // Acende 40% das janelas aleatoriamente
            }
        }
        const winTex = new THREE.CanvasTexture(wC);
        winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;

        // 3 Variações de prédio
        const mats = [0x0f172a, 0x1e293b, 0x334155].map(color => new THREE.MeshStandardMaterial({ 
            color: color, 
            roughness: 0.8,
            emissiveMap: winTex,
            emissive: 0xffffee,
            emissiveIntensity: 0.5 
        }));

        const createBuilding = (xPosition, matIndex) => {
            const h = (Math.random() > 0.4 ? 15 + Math.random() * 60 : 5 + Math.random() * 15);
            const w = Math.random() * 8 + 8;
            const d = Math.random() * 8 + 8;
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[matIndex]);
            
            // Repete a textura de janelas proporcionalmente ao tamanho
            const texClone = winTex.clone();
            texClone.repeat.set(w/10, h/10);
            b.material = b.material.clone();
            b.material.emissiveMap = texClone;

            b.position.set(xPosition + (Math.random()*4-2), h/2, 0);
            b.castShadow = true;
            return b;
        };

        for (let i = 0; i < PER_ROW; i++) {
            const z = -i * SPACING;
            const matIndex = Math.floor(Math.random() * mats.length);

            // Lado esquerdo
            const bLeft = createBuilding(-(CONFIG.ROAD_WIDTH/2 + 10 + Math.random()*10), matIndex);
            bLeft.position.z = z;
            this.scene.add(bLeft);
            this.scenery.push(bLeft);

            // Lado direito
            const bRight = createBuilding(CONFIG.ROAD_WIDTH/2 + 10 + Math.random()*10, matIndex);
            bRight.position.z = z;
            this.scene.add(bRight);
            this.scenery.push(bRight);
        }
    }

    initStreetlights() {
        this.streetlights = [];
        this.powerWires = [];
        const COUNT = 40, SPACING = 60;
        const pGeo = new THREE.CylinderGeometry(0.2, 0.3, 10);
        const pMat = new THREE.MeshPhongMaterial({ color: 0x334155 });
        const lMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        for (let side = -1; side <= 1; side += 2) {
            let lastP = null;
            for (let i = 0; i < COUNT; i++) {
                const g = new THREE.Group();
                const p = new THREE.Mesh(pGeo, pMat); p.position.y = 5; g.add(p);
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1), pMat); b.position.y = 0.5; g.add(b);
                const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.2), pMat); a.position.set(side*-1, 9, 0); g.add(a);
                const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4), lMat); lamp.position.set(side*-1.8, 8.8, 0); g.add(lamp);
                
                const x = side * (CONFIG.ROAD_WIDTH/2 + 1), z = -i * SPACING;
                g.position.set(x, 0, z);
                this.scene.add(g);
                this.streetlights.push(g);
                if (lastP) this.createWire(lastP, new THREE.Vector3(x, 10, z));
                lastP = new THREE.Vector3(x, 10, z);
            }
        }
    }

    initSpeedSigns() {
        const SPACING = 500;
        const COUNT = 10;
        for (let i = 0; i < COUNT; i++) {
            const z = -i * SPACING - 150;
            const group = new THREE.Group();
            
            // Postes
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8), new THREE.MeshPhongMaterial({ color: 0x334155 }));
            pole.position.y = 4;
            group.add(pole);

            // Placa (Círculo com Texto 150)
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            // Borda vermelha
            ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI*2); ctx.fill();
            // Fundo branco
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI*2); ctx.fill();
            // Texto 150 (Fonte maior)
            ctx.fillStyle = 'black'; ctx.font = 'bold 55px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('150', 64, 64);

            const tex = new THREE.CanvasTexture(canvas);
            const sign = new THREE.Mesh(new THREE.CircleGeometry(2, 32), new THREE.MeshStandardMaterial({ 
                map: tex,
                emissive: 0xffffff,
                emissiveIntensity: 0.1, // Reduzido drasticamente para não embaçar com o Bloom
                roughness: 0.5,
                metalness: 0.1
            }));
            sign.position.set(0, 7, 0.2);
            sign.rotation.y = 0; // Encarando o motorista (já que o círculo padrão olha para +Z)
            group.add(sign);

            group.position.set(CONFIG.ROAD_WIDTH/2 + 3, 0, z);
            this.scene.add(group);
            this.speedSigns.push(group);
        }
    }

    setupEventListeners() {
        window.onkeydown = (e) => this.handleKeys(e, true);
        window.onkeyup = (e) => this.handleKeys(e, false);
        window.onresize = () => this.onResize();
        document.getElementById('start-btn').onclick = () => this.start();
        document.getElementById('resume-btn').onclick = () => this.resume();

        // Call Handlers
        document.getElementById('accept-call').onclick = () => this.handleCall(true);
        document.getElementById('reject-call').onclick = () => this.handleCall(false);
    }

    handleKeys(e, s) {
        if (e.key === 'ArrowUp') this.controls.up = s;
        if (e.key === 'ArrowDown') this.controls.down = s;
        if (e.key === 'ArrowLeft') this.controls.left = s;
        if (e.key === 'ArrowRight') this.controls.right = s;
        if (e.key === ' ') this.controls.space = s;
        
        if (e.key === 'Enter' && s) {
            const tipOverlay = document.getElementById('safety-tip-overlay');
            const startScreen = document.getElementById('start-screen');
            if (tipOverlay && !tipOverlay.classList.contains('hidden')) {
                this.resume();
            } else if (startScreen && !startScreen.classList.contains('hidden')) {
                this.start();
            }
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    start() { 
        document.getElementById('start-screen').classList.add('hidden'); 
        this.isPaused = false; 
    }
    
    resume() { 
        if (this.shouldReload) {
            window.location.reload();
            return;
        }
        document.getElementById('safety-tip-overlay').classList.add('hidden'); 
        this.traffic.forEach(t=>this.scene.remove(t.group)); 
        this.traffic=[]; 
        this.isPaused=false; 
    }

    showTip(t) { 
        this.isPaused = true; 
        const tip = TIPS[Math.floor(Math.random()*TIPS.length)]; 
        document.getElementById('tip-title').innerText = t; 
        document.getElementById('tip-text').innerText = tip.text; 
        document.getElementById('safety-tip-overlay').classList.remove('hidden'); 
    }

    triggerViolation(id, scorePenalty, title) {
        this.safeScore -= scorePenalty;
        if (!this.shownViolations.has(id)) {
            this.shownViolations.add(id);
            this.showTip(title);
        }
    }

    triggerCollision(title) {
        this.isPaused = true;
        this.shouldReload = true;
        document.getElementById('tip-title').innerText = title;
        document.getElementById('tip-text').innerText = "Critical impact detected. The simulation will restart.";
        document.getElementById('resume-btn').innerText = "[ENTER] RESTART GAME";
        document.getElementById('safety-tip-overlay').classList.remove('hidden');
    }

    updateTrafficLights() {
        this.lightTimer += 0.016; // Approx. 60fps frame increment
        
        const lastState = this.lightState;
        if (this.lightTimer < 15) this.lightState = 'Green'; // 15 seconds
        else if (this.lightTimer < 20) this.lightState = 'Yellow'; // 5 seconds
        else if (this.lightTimer < 35) this.lightState = 'Red'; // 15 seconds
        else {
            this.lightTimer = 0;
            this.yellowPenaltyApplied = false;
        }

        const HUD_LIGHT = document.getElementById('light-status'); 
        HUD_LIGHT.innerText = this.lightState;
        
        // Signal text coloring
        if (this.lightState === 'Green') HUD_LIGHT.style.color = '#4ade80';
        else if (this.lightState === 'Yellow') HUD_LIGHT.style.color = '#fbbf24';
        else HUD_LIGHT.style.color = '#ef4444';

        // Update visual colors in semaphores with higher intensity for Bloom
        this.semaphores.forEach(s => {
            const { reds, yellows, greens } = s.userData;
            reds.forEach(r => r.material.color.set(this.lightState === 'Red' ? 0xff3333 : 0x111111));
            yellows.forEach(y => y.material.color.set(this.lightState === 'Yellow' ? 0xffff33 : 0x111111));
            greens.forEach(g => g.material.color.set(this.lightState === 'Green' ? 0x33ff33 : 0x111111));
        });

        // Yellow penalty only if there's a visible semaphore (4 cars = 16m)
        const speed = this.player.speed * 200;
        const pZ = this.player.mesh.position.z;
        const isNearSemaphore = this.semaphores.some(s => {
            const dist = pZ - s.position.z; 
            return dist > 0 && dist < 16;
        });

        if (this.lightState === 'Yellow' && isNearSemaphore && speed > 100 && !this.yellowPenaltyApplied) {
            this.yellowPenaltyApplied = true;
            this.triggerViolation("yellow_speed", 50, "VIOLATION: High speed on near Yellow (>100 km/h) (-50 pts)");
        }
    }

    triggerWin() {
        this.isPaused = true;
        this.shouldReload = true;
        document.getElementById('tip-title').innerText = "ROAD LEGEND: 5000 POINTS!";
        document.getElementById('tip-text').innerText = "Incredible! You've reached the master goal. Safety, control, and patience are your best tools. Remember: one safe driver can change the entire flow of a city. Keep up the good work!";
        document.getElementById('resume-btn').innerText = "[ENTER] PLAY AGAIN";
        document.getElementById('safety-tip-overlay').classList.remove('hidden');
    }

    showCourtesyFeedback() {
        this.showFloatingMessage("THANK YOU!", "Courtesy Bonus: +200 pts", "💙");
        this.safeScore += 200;
    }

    showFloatingMessage(title, subtitle, icon) {
        const balloon = document.getElementById('courtesy-balloon');
        if (balloon) {
            balloon.querySelector('.icon').innerText = icon;
            balloon.querySelector('.title').innerText = title;
            balloon.querySelector('.subtitle').innerText = subtitle;
            balloon.classList.remove('hidden');
            // Oculta após um tempo (debounce simples)
            if (this.messageTimeout) clearTimeout(this.messageTimeout);
            this.messageTimeout = setTimeout(() => balloon.classList.add('hidden'), 4000);
        }
    }

    // PHONE MECHANIC METHODS
    triggerIncomingCall() {
        if (this.isPhoneRinging || this.isCallActive) return;
        this.isPhoneRinging = true;
        document.getElementById('phone-container').classList.remove('hidden');
        this.playRinger();
    }

    playRinger() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const playTone = () => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.connect(gain); gain.connect(this.audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(580, this.audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(780, this.audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.4);
                osc.start(); osc.stop(this.audioCtx.currentTime + 0.5);
            };
            playTone();
            this.ringInterval = setInterval(playTone, 1000);
        } catch(e) { console.error("Audio error", e); }
    }

    stopRinger() {
        if (this.ringInterval) clearInterval(this.ringInterval);
        this.isPhoneRinging = false;
    }

    handleCall(accepted) {
        this.stopRinger();
        document.getElementById('phone-container').classList.add('hidden');
        
        if (accepted) {
            this.isCallActive = true;
            this.safeScore -= 300;
            document.getElementById('distraction-warning').classList.remove('hidden');
            
            // Inicia o áudio da chamada (Mãe falando) em loop
            this.activeCallAudio = new Audio('ringtonemom.mp3.mp3');
            this.activeCallAudio.loop = true;
            this.activeCallAudio.play().catch(e => console.error("Audio play error", e));

            // Auto hangup after 5s if player doesn't click
            setTimeout(() => this.endCall(), 5000);
        } else {
            this.safeScore += 200;
            this.showFloatingMessage("SAFETY FIRST!", "Responsible Driver: +200 pts", "📱");
        }
    }

    endCall() {
        if (!this.isCallActive) return;
        this.isCallActive = false;
        document.getElementById('distraction-warning').classList.add('hidden');
        
        // Para o áudio da chamada imediatamente
        if (this.activeCallAudio) {
            this.activeCallAudio.pause();
            this.activeCallAudio.currentTime = 0;
            this.activeCallAudio = null;
        }
    }

    updateWeather() {
       const target = this.weather === 'Sunny' ? 1 : 0.3;
        this.weatherIntensity += (target - this.weatherIntensity) * 0.02;
        this.roadMat.shininess = 10 + (1 - this.weatherIntensity) * 50;
        const sky = new THREE.Color().lerpColors(new THREE.Color(0x334155), new THREE.Color(0x87ceeb), this.weatherIntensity);
        this.scene.background = sky; this.scene.fog.color = sky;
        if (Math.random() < 0.002) { 
            this.weather = this.weather === 'Sunny' ? 'Rainy' : 'Sunny'; 
            document.getElementById('weather').innerText = this.weather; 
            this.toggleRain(); 
        }
    }

    toggleRain() {
        if (this.weather === 'Rainy') {
            const geo = new THREE.BufferGeometry();
            const verts = []; for (let i=0; i<5000; i++) verts.push(Math.random()*40-20, Math.random()*20, Math.random()*100-50);
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            this.rainParticles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8888ff, size: 0.1 }));
            this.scene.add(this.rainParticles);
        } else if (this.rainParticles) { this.scene.remove(this.rainParticles); this.rainParticles = null; }
    }

    spawnTraffic() {
        if (this.traffic.length < 10 && Math.random() < 0.1) {
            const isO = Math.random() > 0.5, lId = Math.random() > 0.5 ? 1 : 2;
            const x = isO ? (lId === 1 ? -3 : -9) : (lId === 1 ? 3 : 9);
            const z = this.player.mesh.position.z - 450;
            
            // Overlap Prevention Logic
            const isColliding = this.traffic.some(c => 
                Math.abs(c.mesh.position.x - x) < 1.0 && 
                Math.abs(c.mesh.position.z - z) < 20
            );

            if (!isColliding) {
                const c = new Car(this.scene, Math.random() * 0xffffff);
                c.mesh.position.set(x, 0, z);
                if (isO) { c.speed = 0.5; c.isOpposite = true; c.mesh.rotation.y = Math.PI; } else { c.speed = 0.8; }
                this.traffic.push(c);
            }
        }
        if (this.pedestrians.length < 25 && Math.random() < 0.2) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const swI = CONFIG.ROAD_WIDTH / 2;
            
            // Busca o semáforo mais próximo à frente (Z negativo, então maior Z é mais perto)
            const aheadSemas = this.semaphores.filter(s => s.position.z < this.player.mesh.position.z - 50);
            aheadSemas.sort((a, b) => b.position.z - a.position.z);
            const nearSema = aheadSemas[0];

            let pZ, willCross = false;
            
            // Spawn na faixa se estiver num alcance visível (até 400m)
            if (nearSema && Math.abs(nearSema.position.z - this.player.mesh.position.z) < 400 && Math.random() > 0.3) {
                pZ = nearSema.position.z + 8;
                willCross = true;
            } else {
                // Spawn aleatório na calçada bem mais perto do jogador (50 a 150m) para evitar que a neblina os esconda
                pZ = this.player.mesh.position.z - 50 - Math.random() * 100;
            }

            const pX = side * (swI + 1.2);
            const pColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
            const p = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 2.2, 0.7), 
                new THREE.MeshStandardMaterial({ 
                    color: pColor, 
                    emissive: pColor, 
                    emissiveIntensity: 0.8, // Brilho intenso para visibilidade
                    metalness: 0.5,
                    roughness: 0.2
                })
            );
            p.position.set(pX, 1.1, pZ); 
            this.scene.add(p);

            this.pedestrians.push({ 
                mesh: p, 
                speedZ: willCross ? 0 : 0.2 + Math.random() * 0.15,
                speedX: 0.13, 
                side: side,
                willCross: willCross,
                isCrossing: false
            });
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isPaused) {
            // Lógica de "Órbita" Cinematic no Menu
            const time = Date.now() * 0.0005;
            this.camera.position.x = Math.sin(time) * 20;
            this.camera.position.z = Math.cos(time) * 15 + 10;
            this.camera.position.y = 5;
            this.camera.lookAt(0, 2, 0);
            this.composer.render();
            return;
        }

        this.updateWeather();
        this.updateTrafficLights();
        this.spawnTraffic();
        this.player.update(this.controls, this.weather);
        
        const speed = Math.floor(this.player.speed*200);
        const speedHUD = document.getElementById('speed');
        speedHUD.innerText = `${speed} km/h`;
        
        // Velocity Color Feedback
        speedHUD.style.color = (speed > 150) ? '#ef4444' : '#ffffff';
        
        // Speed Scoring Logic
        if (speed > 0 && speed <= 150) {
            this.safeScore += 0.15; // Consistent reward for safe speeds
        } else if (speed > 150) {
            this.safeScore -= 0.6; // Heavy penalty for speeding
        }

        if (this.safeScore >= 5000) {
            this.triggerWin();
        }

        // Check for Call Triggers
        if (this.callTriggers.length > 0 && this.safeScore >= this.callTriggers[0]) {
            this.callTriggers.shift(); // Remove o primeiro gatilho
            this.triggerIncomingCall();
        }

        // Wrong Lane Penalty (Left of the yellow line)
        if (this.player.mesh.position.x < 0) {
            this.triggerViolation("wrong_lane", 0.55, "VIOLATION: Driving on the wrong side! (-100 pts every 3s)");
        }

        this.traffic.forEach((c, idx) => {
            // Lógica de Direção Inteligente (IA)
            let limitSpeed = c.baseSpeed || (c.baseSpeed = c.speed);
            
            // 1. DETECÇÃO DE VEÍCULOS À FRENTE (Evitar Colisão)
            const aheadCars = this.traffic.filter(other => 
                other !== c && 
                Math.abs(other.mesh.position.x - c.mesh.position.x) < 1.5 && // Mesma faixa
                (c.isOpposite ? other.mesh.position.z > c.mesh.position.z : other.mesh.position.z < c.mesh.position.z)
            );

            if (aheadCars.length > 0) {
                // Ordena e pega o carro mais próximo à frente
                aheadCars.sort((a, b) => Math.abs(a.mesh.position.z - c.mesh.position.z) - Math.abs(b.mesh.position.z - c.mesh.position.z));
                const distToCar = Math.abs(aheadCars[0].mesh.position.z - c.mesh.position.z);
                
                // Se houver carro perto à frente, reduz o limite de velocidade (distância de segurança de 7m)
                if (distToCar < 7) limitSpeed = 0; 
                else if (distToCar < 12) limitSpeed *= 0.4;
            }

            // 2. LÓGICA DE SEMÁFORO (Frenagem Localizada)
            let distToSema = 999;
            if (!c.isOpposite) {
                const ahead = this.semaphores.filter(s => s.position.z < c.mesh.position.z);
                if (ahead.length > 0) {
                    ahead.sort((a,b) => b.position.z - a.position.z);
                    distToSema = c.mesh.position.z - ahead[0].position.z;
                }
            } else {
                const ahead = this.semaphores.filter(s => s.position.z > c.mesh.position.z);
                if (ahead.length > 0) {
                    ahead.sort((a,b) => a.position.z - b.position.z);
                    distToSema = ahead[0].position.z - c.mesh.position.z;
                }
            }

            let targetSpeed = limitSpeed;
            if (this.lightState === 'Red' && distToSema < 16 && distToSema > 0) {
                targetSpeed = 0;
            } else if (this.lightState === 'Yellow' && distToSema < 25 && distToSema > 0) {
                targetSpeed = limitSpeed * 0.3;
            }

            // Aplicação suave da velocidade
            c.speed += (targetSpeed - c.speed) * 0.1;

            c.mesh.position.z += c.isOpposite ? c.speed*2 : -c.speed*0.5;
           if (Math.abs(this.player.mesh.position.x - c.mesh.position.x) < 1.8 && Math.abs(this.player.mesh.position.z - c.mesh.position.z) < 3.8) {
               this.triggerCollision("COLLISION!");
           }
            if (c.mesh.position.z - this.player.mesh.position.z > 50) { this.scene.remove(c.mesh); this.traffic.splice(idx, 1); }
        });

        this.pedestrians.forEach((p, idx) => {
            if (p.willCross) {
                const distToPed = this.player.mesh.position.z - p.mesh.position.z;
                // Detecção de cortesia: jogador parado a poucos metros (5 a 18 unidades) da faixa
                const isPlayerStopping = this.player.speed < 0.05 && distToPed > 5 && distToPed < 18;

                // Atravessa se: Sinal Vermelho OU Cortesia (Sinal Verde + Carro Parado por perto) OU já está atravessando
                if (this.lightState === 'Red' || (this.lightState === 'Green' && isPlayerStopping) || p.isCrossing) {
                    if (!p.isCrossing && this.lightState === 'Green' && isPlayerStopping && !this.isProcessingCourtesy) {
                        p.isCourtesy = true; 
                        this.isProcessingCourtesy = true; // Impede que múltiplos pedestres deem bônus ao mesmo tempo
                    }
                    
                    p.isCrossing = true;
                    p.mesh.position.x -= p.speedX * p.side;
                    
                    // Se terminou de atravessar, continua andando na calçada oposta
                    if (Math.abs(p.mesh.position.x) > CONFIG.ROAD_WIDTH/2 + 3) {
                        if (p.isCourtesy) {
                            this.showCourtesyFeedback();
                            p.isCourtesy = false;
                            // Reset do flag de cortesia após um tempo para permitir o próximo semáforo
                            setTimeout(() => { this.isProcessingCourtesy = false; }, 5000);
                        }
                        p.willCross = false;
                        p.isCrossing = false;
                        p.speedZ = 0.1; 
                    }
                }
            } else {
                p.mesh.position.z += p.speedZ;
            }

            // Colisão com pedestre (Atropelamento)
            const dx = Math.abs(this.player.mesh.position.x - p.mesh.position.x);
            const dz = Math.abs(this.player.mesh.position.z - p.mesh.position.z);
            if (dx < 1.4 && dz < 2.0) {
                this.triggerCollision("FATAL ACCIDENT: Pedestrian Hit!");
            }

            if (p.mesh.position.z - this.player.mesh.position.z > 50) { 
                this.scene.remove(p.mesh); 
                this.pedestrians.splice(idx, 1); 
            }
        });

        const pZ = this.player.mesh.position.z;
        this.road.position.z = pZ; this.grass.position.z = pZ; this.leftSidewalk.position.z = pZ;
        this.rightSidewalk.position.z = pZ; this.leftCurb.position.z = pZ; this.rightCurb.position.z = pZ;
        
        this.semaphores.forEach(o => {
            const ud = o.userData;
            // Detecta quando o carro passa pela linha do semáforo
            if (!ud.passed && this.player.mesh.position.z < o.position.z) {
                ud.passed = true;
                if (this.lightState === 'Red') {
                    this.triggerViolation("red_light", 200, "SERIOUS VIOLATION: Ran a Red Light (-200 pts)");
                } else if (this.lightState === 'Green') {
                    // Removido o bônus automático de +200 no verde para manter o equilíbrio
                }
            }

            if (o.position.z > pZ + 50) {
                 o.position.z -= 2400; // Recicla
                 ud.passed = false; // Reset da passagem
            }
        });

        this.streetlights.forEach(o => { 
            if (o.position.z > pZ + 100) o.position.z -= 2400; });
        this.powerWires.forEach(w => { if (w.mesh.position.z + w.initialZ > pZ + 100) w.mesh.position.z -= 2400; });
        this.lines.forEach(l => { if (l.position.z > pZ + 20) l.position.z -= 500; });
        this.scenery.forEach(o => { if (o.position.z > pZ + 100) o.position.z -= 2400; }); // PER_ROW(80) * SPACING(30) = 2400
        this.speedSigns.forEach(s => { if (s.position.z > pZ + 100) s.position.z -= 5000; }); // 10 placas * 500m
       if (this.rainParticles) { this.rainParticles.position.z = pZ; this.rainParticles.position.y -= 0.5; if (this.rainParticles.position.y < -10) this.rainParticles.position.y = 0; }
        
        this.camera.position.set(this.player.mesh.position.x * 0.5, 5, pZ + 15);
        this.camera.lookAt(this.player.mesh.position.x, 2, pZ - 10);
        document.getElementById('safe-score').innerText = Math.floor(this.safeScore);
        this.composer.render();
    }
}

new Simulation();
