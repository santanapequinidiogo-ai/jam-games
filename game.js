import * as THREE from 'three';

const CONFIG = {
    ROAD_WIDTH: 24, 
    LANES: 4,
    SAFE_DISTANCE: 25, 
    SPEED_LIMIT: 100, 
    ACCEL: 0.25,
    BRAKE: 0.5,
    MAX_SPEED: 1.5,
    TURN_SPEED: 0.15 
};

const TIPS = [
    { title: "DISTÂNCIA DE FRENAGEM", text: "A 80km/h, sua distância de frenagem dobra em relação a 40km/h. Mantenha distância segura." },
    { title: "PISTA MOLHADA", text: "Sob chuva, o atrito reduz em até 50%. Sua capacidade de manobrar é severamente afetada." },
    { title: "PONTO CEGO", text: "No simulador 3D, lembre-se: o que está logo atrás ou ao lado pode ser invisível sem retrovisores." }
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
        const wGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12);
        const wMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const wPos = [[-carW/2-0.1, 0.4, 1.2], [carW/2+0.1, 0.4, 1.2], [-carW/2-0.1, 0.4, -1.2], [carW/2+0.1, 0.4, -1.2]];
        wPos.forEach(p => {
            const w = new THREE.Mesh(wGeo, wMat);
            w.rotation.z = Math.PI/2;
            w.position.set(...p);
            this.group.add(w);
        });

        // Luzes
        const lGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const fMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Frontal
        const tMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Traseira
        
        const f1 = new THREE.Mesh(lGeo, fMat); f1.position.set(-carW/2+0.4, carH/2+0.6, -2);
        const f2 = f1.clone(); f2.position.x = carW/2-0.4;
        const r1 = new THREE.Mesh(lGeo, tMat); r1.position.set(-carW/2+0.4, carH/2+0.6, 2);
        const r2 = r1.clone(); r2.position.x = carW/2-0.4;
        
        this.group.add(f1, f2, r1, r2);

        scene.add(this.group);
        this.mesh = this.group;
        this.speed = 0;
        this.isPlayer = isPlayer;
    }

    update(controls, weather) {
        if (!this.isPlayer) return;
        if (controls.up) this.speed += CONFIG.ACCEL * 0.01;
        if (controls.down) this.speed -= CONFIG.BRAKE * 0.01;
        this.speed *= (weather === 'Chuva' ? 0.997 : 0.999);
        this.speed = Math.max(0, Math.min(this.speed, CONFIG.MAX_SPEED));
        
        if (controls.left) this.mesh.position.x -= CONFIG.TURN_SPEED;
        if (controls.right) this.mesh.position.x += CONFIG.TURN_SPEED;
        
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
        this.scene.background = new THREE.Color(0x0f172a);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.traffic = [];
        this.pedestrians = [];
        this.semaphores = [];
        this.streetlights = [];
        this.powerWires = [];
        this.scenery = [];
        
        this.initLights();
        this.initEnvironment();
        
        this.player = new Car(this.scene, 0x4f46e5, true);
        
        // Estado do Ciclo de Tráfego
        this.lightState = 'Verde'; 
        this.lightTimer = 0;
        this.yellowPenaltyApplied = false;

        this.weather = 'Ensolarado';
       this.weatherIntensity = 1;
        this.safeScore = 0;
        this.isPaused = true;
        this.controls = { up: false, down: false, left: false, right: false };
        this.rainParticles = null;
        
        this.setupEventListeners();
    }

    initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        this.sunLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);
    }

    initEnvironment() {
        // Chão base
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 4000),
            new THREE.MeshPhongMaterial({ color: 0x334155 })
        );
        ground.rotation.x = -Math.PI/2;
        ground.position.y = -0.1;
        this.scene.add(ground);
        this.grass = ground;

        // Estrada
        this.roadMat = new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 10 });
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
        this.initSemaphores(); // NOVO

        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.01);
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

            // 4. Faixa de Pedestres (Zebrada)
            const stripeGeo = new THREE.PlaneGeometry(24, 1.5);
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
            for (let s = 0; s < 6; s++) {
                const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                stripe.rotation.x = -Math.PI / 2;
                stripe.position.set(0, 0.08, z + 5 + s * 2.5);
                this.scene.add(stripe);
                this.lines.push(stripe); // Adiciona ao pool de reciclagem
            }
        }
    }
    initBuildings() {
        this.scenery = [];
        const ROWS = 15, PER_ROW = 80, SPACING = 30; // Grade mais larga
        const COLORS = [0x64748b, 0x475569, 0x334155, 0x1e293b, 0x94a3b8, 0x7c2d12, 0x1e3b8a];
        const BLOCK_WIDTH = 18; // Cada "lote" tem 18m de largura

        for (let row = 1; row <= ROWS; row++) {
            for (let i = 0; i < PER_ROW; i++) {
                const isTall = Math.random() > 0.4;
                const w = 15; // Largura fixa menor que o lote para evitar sobreposição
                const h = (isTall ? 15 + Math.random() * 60 : 5 + Math.random() * 15) * (1 - (row * 0.04));
                const d = SPACING - 5; // Deixa um "beco" entre os prédios no eixo Z
                
                const b = new THREE.Mesh(
                    new THREE.BoxGeometry(w, h, d),
                    new THREE.MeshPhongMaterial({ color: COLORS[Math.floor(Math.random()*COLORS.length)], shininess: 30 })
                );
                const side = Math.random() > 0.5 ? 1 : -1;
                
                // GRADE PERFEITA: Sem sobreposição lateral (Eixo X)
                const posX = side * (CONFIG.ROAD_WIDTH/2 + 6 + (row * BLOCK_WIDTH)); 
                b.position.set(posX, h/2, -i * SPACING);
                b.castShadow = true;
                this.scene.add(b);
                this.scenery.push(b);
            }
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

    createWire(p1, p2) {
        const midZ = (p1.z + p2.z)/2;
        const curve = new THREE.CatmullRomCurve3([p1, new THREE.Vector3(p1.x, p1.y-2, midZ), p2]);
        const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)), new THREE.LineBasicMaterial({ color: 0x111111 }));
        this.scene.add(wire);
        this.powerWires.push({ mesh: wire, initialZ: midZ });
    }

    setupEventListeners() {
        window.onkeydown = (e) => this.handleKeys(e, true);
        window.onkeyup = (e) => this.handleKeys(e, false);
        window.onresize = () => this.onResize();
        document.getElementById('start-btn').onclick = () => this.start();
        document.getElementById('resume-btn').onclick = () => this.resume();
    }

    handleKeys(e, s) {
        if (e.key === 'ArrowUp') this.controls.up = s;
        if (e.key === 'ArrowDown') this.controls.down = s;
        if (e.key === 'ArrowLeft') this.controls.left = s;
        if (e.key === 'ArrowRight') this.controls.right = s;
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    start() { document.getElementById('start-screen').classList.add('hidden'); this.isPaused = false; this.animate(); }
    resume() { document.getElementById('safety-tip-overlay').classList.add('hidden'); this.traffic.forEach(t=>this.scene.remove(t.group)); this.traffic=[]; this.isPaused=false; requestAnimationFrame(()=>this.animate()); }
    showTip(t) { this.isPaused = true; const tip = TIPS[Math.floor(Math.random()*TIPS.length)]; document.getElementById('tip-title').innerText = t; document.getElementById('tip-text').innerText = tip.text; document.getElementById('safety-tip-overlay').classList.remove('hidden'); }

    updateTrafficLights() {
        this.lightTimer += 0.016; // Incremento aproximado por frame (60fps)
        
        const lastState = this.lightState;
        if (this.lightTimer < 10) this.lightState = 'Verde';
        else if (this.lightTimer < 15) this.lightState = 'Amarelo'; // 5 segundos
        else if (this.lightTimer < 25) this.lightState = 'Vermelho'; // 10 segundos
        else {
            this.lightTimer = 0;
            this.yellowPenaltyApplied = false;
        }

        const HUD_LIGHT = document.getElementById('light-status'); 
        HUD_LIGHT.innerText = this.lightState;
        
        // Coloração do texto do sinal
        if (this.lightState === 'Verde') HUD_LIGHT.style.color = '#4ade80';
        else if (this.lightState === 'Amarelo') HUD_LIGHT.style.color = '#fbbf24';
        else HUD_LIGHT.style.color = '#ef4444';

        // Atualiza cores visuais nos semáforos
        this.semaphores.forEach(s => {
            const { reds, yellows, greens } = s.userData;
            reds.forEach(r => r.material.color.set(this.lightState === 'Vermelho' ? 0xff0000 : 0x222222));
            yellows.forEach(y => y.material.color.set(this.lightState === 'Amarelo' ? 0xffff00 : 0x222222));
            greens.forEach(g => g.material.color.set(this.lightState === 'Verde' ? 0x00ff00 : 0x222222));
        });

        // Penalidade de Amarelo apenas se houver semáforo visível (4 carros = 16m)
        const speed = this.player.speed * 200;
        const pZ = this.player.mesh.position.z;
        const isNearSemaphore = this.semaphores.some(s => {
            const dist = pZ - s.position.z; 
            return dist > 0 && dist < 16; // Está nos próximos 16 metros (4 carros)
        });

        if (this.lightState === 'Amarelo' && isNearSemaphore && speed > 50 && !this.yellowPenaltyApplied) {
            this.safeScore -= 50;
            this.yellowPenaltyApplied = true;
            this.showTip("INFRAÇÃO: Velocidade no Amarelo Próximo (-50 pts)");
        }
    }

    updateWeather() {
       const target = this.weather === 'Ensolarado' ? 1 : 0.3;
        this.weatherIntensity += (target - this.weatherIntensity) * 0.02;
        this.roadMat.shininess = 10 + (1 - this.weatherIntensity) * 50;
        const sky = new THREE.Color().lerpColors(new THREE.Color(0x334155), new THREE.Color(0x87ceeb), this.weatherIntensity);
        this.scene.background = sky; this.scene.fog.color = sky;
        if (Math.random() < 0.002) { this.weather = this.weather === 'Ensolarado' ? 'Chuva' : 'Ensolarado'; document.getElementById('weather').innerText = this.weather; this.toggleRain(); }
    }

    toggleRain() {
        if (this.weather === 'Chuva') {
            const geo = new THREE.BufferGeometry();
            const verts = []; for (let i=0; i<5000; i++) verts.push(Math.random()*40-20, Math.random()*20, Math.random()*100-50);
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            this.rainParticles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8888ff, size: 0.1 }));
            this.scene.add(this.rainParticles);
        } else if (this.rainParticles) { this.scene.remove(this.rainParticles); this.rainParticles = null; }
    }

    spawnTraffic() {
        if (this.traffic.length < 3 && Math.random() < 0.04) {
            const isO = Math.random() > 0.5, lId = Math.random() > 0.5 ? 1 : 2;
            const x = isO ? (lId === 1 ? -3 : -9) : (lId === 1 ? 3 : 9);
            const c = new Car(this.scene, Math.random() * 0xffffff);
            c.mesh.position.set(x, 0, this.player.mesh.position.z - 450);
            if (isO) { c.speed = 0.5; c.isOpposite = true; c.mesh.rotation.y = Math.PI; } else { c.speed = 0.8; }
            this.traffic.push(c);
        }
        if (this.pedestrians.length < 15 && Math.random() < 0.08) {
            const side = Math.random() > 0.5 ? 1 : -1, swI = CONFIG.ROAD_WIDTH / 2;
            const pX = side * (swI + Math.random() * 5.5), pZ = this.player.mesh.position.z - 350;
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.5), new THREE.MeshPhongMaterial({ color: Math.random()*0xffffff }));
            p.position.set(pX, 0.9, pZ); this.scene.add(p);
            this.pedestrians.push({ mesh: p, speed: 0.1 + Math.random()*0.1 });
        }
    }

    animate() {
        if (this.isPaused) return;
        requestAnimationFrame(() => this.animate());
        this.updateWeather();
        this.updateTrafficLights(); // NOVO
        this.spawnTraffic();
        this.player.update(this.controls, this.weather);
        
        const speed = Math.floor(this.player.speed*200);
        document.getElementById('speed').innerText = `${speed} km/h`;
        if (speed > CONFIG.SPEED_LIMIT) this.safeScore -= 0.1;

        this.traffic.forEach((c, idx) => {
            // Lógica de Semáforo para Carros
            let targetSpeed = c.baseSpeed || (c.baseSpeed = c.speed);
            if (this.lightState === 'Amarelo') c.speed = targetSpeed * 0.4;
            else if (this.lightState === 'Vermelho') c.speed = 0;
            else c.speed = targetSpeed;

            c.mesh.position.z += c.isOpposite ? c.speed*2 : -c.speed*0.5;
           if (Math.abs(this.player.mesh.position.x - c.mesh.position.x) < 1.8 && Math.abs(this.player.mesh.position.z - c.mesh.position.z) < 3.8) this.showTip("COLISÃO!");
            if (c.mesh.position.z - this.player.mesh.position.z > 50) { this.scene.remove(c.mesh); this.traffic.splice(idx, 1); }
        });

        this.pedestrians.forEach((p, idx) => {
            p.mesh.position.z += p.speed;
            if (p.mesh.position.z - this.player.mesh.position.z > 50) { this.scene.remove(p.mesh); this.pedestrians.splice(idx, 1); }
        });

        const pZ = this.player.mesh.position.z;
        this.road.position.z = pZ; this.grass.position.z = pZ; this.leftSidewalk.position.z = pZ;
        this.rightSidewalk.position.z = pZ; this.leftCurb.position.z = pZ; this.rightCurb.position.z = pZ;
        
        this.semaphores.forEach(o => {
            const ud = o.userData;
            // Se o sinal está Vermelho e o player acaba de passar pela linha (Crossing)
            if (!ud.passed && this.player.mesh.position.z < o.position.z) {
                ud.passed = true;
                if (this.lightState === 'Vermelho') {
                    this.safeScore -= 200;
                    this.showTip("INFRAÇÃO GRAVE: Furou o Sinal Vermelho (-200 pts)");
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
       if (this.rainParticles) { this.rainParticles.position.z = pZ; this.rainParticles.position.y -= 0.5; if (this.rainParticles.position.y < -10) this.rainParticles.position.y = 0; }
        
        this.camera.position.set(this.player.mesh.position.x * 0.5, 5, pZ + 15);
        this.camera.lookAt(this.player.mesh.position.x, 2, pZ - 10);
        document.getElementById('safe-score').innerText = Math.floor(this.safeScore);
        this.renderer.render(this.scene, this.camera);
    }
}

new Simulation();
