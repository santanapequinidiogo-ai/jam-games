/**
 * OWN THE ROAD - GGJ Edition
 * Um simulador de direção segura focado em física e tomada de decisão.
 * Desenvolvido para Global Game Jam.
 */

// --- CONFIGURAÇÕES DO SIMULADOR ---
const CONFIG = {
    ROAD_WIDTH: 400,
    LANES: 4,
    SAFE_DISTANCE: 180, // Pixels (equivalente a metros na escala do jogo)
    SPEED_LIMIT: 100, // km/h
    FRICTION_DRY: 0.98,
    FRICTION_WET: 0.995, // Menos atrito = mais deslizamento lateral
    ACCEL: 0.2,
    BRAKE: 0.5,
    TURN_SPEED: 0.04,
    MAX_SPEED: 180
};

const TIPS = [
    { title: "DISTÂNCIA DE FRENAGEM", text: "A 80km/h, sua distância de frenagem dobra em relação a 40km/h. Mantenha sempre 2 segundos de distância." },
    { title: "PISTA MOLHADA", text: "Sob chuva, o atrito dos pneus reduz em até 50%. Sua capacidade de fazer curvas e frear bruscamente é severamente comprometida." },
    { title: "VELOCIDADE x IMPACTO", text: "Um atropelamento a 60km/h equivale a cair do 5º andar de um prédio. Respeite as faixas de pedestre." },
    { title: "TEMPO DE REAÇÃO", text: "Um motorista atento leva cerca de 1 segundo para reagir. A 100km/h, você percorre 28 metros antes mesmo de encostar no freio." }
];

// --- CLASSES PRINCIPAIS ---

class Vehicle {
    constructor(x, y, color, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        this.color = color;
        this.speed = 0;
        this.angle = 0;
        this.isPlayer = isPlayer;
        this.lane = Math.floor(x / (CONFIG.ROAD_WIDTH / CONFIG.LANES));
        
        // Física
        this.velocity = { x: 0, y: 0 };
        this.acceleration = 0;
        this.friction = CONFIG.FRICTION_DRY;
    }

    update(controls, weather) {
        if (this.isPlayer) {
            this.handlePlayerMovement(controls, weather);
        } else {
            this.handleAICar();
        }

        // Aplica Inércia e Atrito
        this.x += this.velocity.x;
        this.y -= this.speed / 5; // Movimento relativo ao mundo (neste caso o mundo desce)
        
        this.velocity.x *= weather === 'Chuva' ? 0.96 : 0.92;
        
        // Limites da estrada
        const roadLeft = (canvas.width - CONFIG.ROAD_WIDTH) / 2;
        const roadRight = roadLeft + CONFIG.ROAD_WIDTH;
        if (this.x < roadLeft + 5) this.x = roadLeft + 5;
        if (this.x > roadRight - this.width - 5) this.x = roadRight - this.width - 5;
    }

    handlePlayerMovement(controls, weather) {
        // Aceleração / Frenagem
        if (controls.forward) this.speed += CONFIG.ACCEL;
        if (controls.reverse) this.speed -= CONFIG.BRAKE;
        
        // Atrito natural do ar/rolagem
        this.speed *= 0.99;
        if (Math.abs(this.speed) < 0.1) this.speed = 0;
        if (this.speed > CONFIG.MAX_SPEED) this.speed = CONFIG.MAX_SPEED;

        // Direção (Inércia lateral dependente da velocidade)
        const turnEffect = Math.min(this.speed / 20, 1.5); // Não vira parado
        if (controls.left) this.velocity.x -= CONFIG.TURN_SPEED * turnEffect;
        if (controls.right) this.velocity.x += CONFIG.TURN_SPEED * turnEffect;

        // Se estiver chovendo, a resposta lateral é mais lenta/descontrolada
        if (weather === 'Chuva') {
            this.velocity.x *= 0.99; 
        }
    }

    handleAICar() {
        this.speed = 40 + (this.lane * 15); // Velocidades diferentes por faixa
        // Carros de IA apenas seguem reto por enquanto
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.velocity.x * 0.1); // Inclinação visual ao girar

        // Sombra
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 4, this.width, this.height);

        // Corpo do Carro
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 8);
        ctx.fill();

        // Detalhes (Pára-brisa, Rodas, Luzes)
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(-this.width / 2 + 5, -this.height / 2 + 15, this.width - 10, 20); // Vidro

        // Faróis dianteiros (brancos)
        ctx.fillStyle = "#fff";
        ctx.fillRect(-this.width / 2 + 5, -this.height / 2 + 5, 8, 4);
        ctx.fillRect(this.width / 2 - 13, -this.height / 2 + 5, 8, 4);

        // Lanternas traseiras (vermelhas) - Brilham ao frear
        ctx.fillStyle = (this.isPlayer && controls.reverse) ? "#ff0000" : "#990000";
        ctx.fillRect(-this.width / 2 + 5, this.height / 2 - 8, 10, 4);
        ctx.fillRect(this.width / 2 - 15, this.height / 2 - 8, 10, 4);

        ctx.restore();
    }
}

// --- CORE DO JOGO ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const controls = { forward: false, reverse: false, left: false, right: false };

let player;
let traffic = [];
let ghosts = []; // Pedestres ou obstáculos
let gameTime = 0;
let safeScore = 0;
let weather = 'Ensolarado';
let isPaused = false; // Start true but need to manage it
let roadOffset = 0;

function init() {
    resize();
    isPaused = true;
    player = new Vehicle(canvas.width / 2 - 20, canvas.height - 200, "#4f46e5", true);
    traffic = [];
    ghosts = []; 
    safeScore = 0;
    
    // Listeners
    window.addEventListener('keydown', e => handleKey(e, true));
    window.addEventListener('keyup', e => handleKey(e, false));
    document.getElementById('start-btn').onclick = startGame;
    document.getElementById('resume-btn').onclick = resumeGame;
}

function handleKey(e, state) {
    if (e.key === "ArrowUp") controls.forward = state;
    if (e.key === "ArrowDown") controls.reverse = state;
    if (e.key === "ArrowLeft") controls.left = state;
    if (e.key === "ArrowRight") controls.right = state;
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    isPaused = false;
    requestAnimationFrame(update);
}

function resumeGame() {
    document.getElementById('safety-tip-overlay').classList.add('hidden');
    isPaused = false;
    // Reset player position slightly higher to avoid immediate re-collision
    player.speed = 0;
    player.velocity.x = 0;
    traffic = traffic.filter(c => Math.abs(c.y - player.y) > 200);
    requestAnimationFrame(update);
}

function showTip(type) {
    isPaused = true;
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    document.getElementById('tip-title').innerText = type;
    document.getElementById('tip-text').innerText = tip.text;
    document.getElementById('safety-tip-overlay').classList.remove('hidden');
}

// --- SISTEMA DE EVENTOS ---

function spawnTraffic() {
    // Carros de outros motoristas
    if (traffic.length < 5 && Math.random() < 0.02) {
        const lane = Math.floor(Math.random() * CONFIG.LANES);
        const roadX = (canvas.width - CONFIG.ROAD_WIDTH) / 2;
        const x = roadX + (lane * (CONFIG.ROAD_WIDTH / CONFIG.LANES)) + 10;
        const color = `hsl(${Math.random() * 360}, 50%, 60%)`;
        traffic.push(new Vehicle(x, -300, color));
    }

    // Pedestres (Atravessando a rua ocasionalmente)
    if (ghosts.length < 1 && Math.random() < 0.005) {
        const roadX = (canvas.width - CONFIG.ROAD_WIDTH) / 2;
        ghosts.push({
            x: roadX - 50,
            y: -100,
            speedX: 1.5,
            width: 15,
            height: 15
        });
    }
}

function updateWeather() {
    gameTime++;
    if (gameTime % 1000 === 0) {
        weather = weather === 'Ensolarado' ? 'Chuva' : 'Ensolarado';
        document.getElementById('weather').innerText = weather;
        document.getElementById('weather-box').style.borderColor = weather === 'Chuva' ? 'var(--accent)' : 'transparent';
    }
}

// --- RENDERIZAÇÃO E LOOP ---

function drawRoad() {
    const roadX = (canvas.width - CONFIG.ROAD_WIDTH) / 2;
    
    // Asfalto
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(roadX, 0, CONFIG.ROAD_WIDTH, canvas.height);

    // Linhas Laterais
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(roadX + 2, -10, CONFIG.ROAD_WIDTH - 4, canvas.height + 20);

    // Linhas de Faixa (Animadas)
    roadOffset += player.speed / 10;
    ctx.setLineDash([40, 40]);
    ctx.lineDashOffset = -roadOffset;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    
    for (let i = 1; i < CONFIG.LANES; i++) {
        const lx = roadX + (i * (CONFIG.ROAD_WIDTH / CONFIG.LANES));
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, canvas.height);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

function update() {
    if (isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateWeather();
    spawnTraffic();
    drawRoad();

    player.update(controls, weather);
    
    // Desenha Zona de Segurança (Aura visual)
    const roadX = (canvas.width - CONFIG.ROAD_WIDTH) / 2;
    ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
    ctx.fillRect(player.x - 5, player.y - CONFIG.SAFE_DISTANCE, player.width + 10, CONFIG.SAFE_DISTANCE);
    
    player.draw(ctx);

    // Atualiza Tráfego
    traffic.forEach((car, index) => {
        // O carro se move relativo ao mundo, mas aqui o mundo desce conforme a velocidade do player
        // Então ajustamos a posição Y do tráfego baseada na diferença de velocidade
        const relativeSpeed = car.speed - player.speed;
        car.y -= relativeSpeed / 10;
        
        car.draw(ctx);

        // Checa Colisão
        if (checkCollision(player, car)) {
            showTip("COLISÃO DETECTADA!");
        }

        // Checa Distância Segura (Score)
        const dist = Math.abs(player.y - car.y);
        if (dist < CONFIG.SAFE_DISTANCE && dist > 50 && Math.abs(player.x - car.x) < 50) {
            // Muito perto! Score para de subir ou desce
            safeScore -= 1;
        } else if (player.speed > 20) {
            safeScore += 0.5;
        }

        // Remove carros fora da tela
        if (car.y > canvas.height + 100 || car.y < -500) {
            traffic.splice(index, 1);
        }
    });

    // Atualiza Pedestres
    ghosts.forEach((p, index) => {
        p.x += p.speedX;
        p.y += player.speed / 10; // Fica parado em relação à estrada

        ctx.fillStyle = "#fbbf24"; // Cor de alerta
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.width, 0, Math.PI * 2);
        ctx.fill();

        // Colisão com pedestre (Grave!)
        if (Math.abs(player.x - p.x) < 30 && Math.abs(player.y - p.y) < 30) {
            showTip("ATROPELAMENTO!");
            ghosts.splice(index, 1);
        }

        if (p.y > canvas.height || p.x > canvas.width) ghosts.splice(index, 1);
    });

    // UI Updates
    document.getElementById('safe-score').innerText = Math.floor(safeScore);
    document.getElementById('speed').innerText = `${Math.floor(player.speed)} km/h`;
    
    if (player.speed > CONFIG.SPEED_LIMIT) {
        document.getElementById('speed').style.color = "var(--danger)";
        safeScore -= 0.2; // Penaliza excesso de velocidade
    } else {
        document.getElementById('speed').style.color = "var(--text)";
    }

    // Efeito de Chuva Visual
    if (weather === 'Chuva') {
        drawRain();
    }

    requestAnimationFrame(update);
}

function checkCollision(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

function drawRain() {
    ctx.strokeStyle = "rgba(174, 194, 224, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        const rx = Math.random() * canvas.width;
        const ry = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 15);
        ctx.stroke();
    }
}

// Inicializa o simulador
init();
window.onresize = resize;
