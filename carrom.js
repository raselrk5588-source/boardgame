const carromGame = (function() {
    let canvas, ctx;
    let width = 800, height = 800; // Internal canvas resolution
    let scale = 1;
    
    // Physics constants
    const FRICTION = 0.985;
    const BOARD_MARGIN = 50;
    const HOLE_RADIUS = 35;
    const STRIKER_RADIUS = 25;
    const COIN_RADIUS = 18;
    
    let coins = [];
    let striker = null;
    let isDragging = false;
    let aimAngle = 0;
    let power = 0; // 0 to 100
    
    let animationId = null;
    let gameState = 'idle'; // idle, aiming, moving
    let turn = 1;
    let score1 = 0, score2 = 0;
    let gameMode = 'bot'; // 'bot' or 'local'
    let scoredOwnCoin = false;
    
    class Circle {
        constructor(x, y, radius, color, type, mass = 1) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.color = color;
            this.type = type; // 'striker', 'white', 'black', 'queen'
            this.mass = mass;
            this.vx = 0;
            this.vy = 0;
            this.active = true;
        }
        
        draw(ctx) {
            if (!this.active) return;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Inner details
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            if (this.type === 'striker') {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
            }
        }
        
        update() {
            if (!this.active) return;
            this.x += this.vx;
            this.y += this.vy;
            
            this.vx *= FRICTION;
            this.vy *= FRICTION;
            
            if (Math.abs(this.vx) < 0.05) this.vx = 0;
            if (Math.abs(this.vy) < 0.05) this.vy = 0;
        }
    }
    
    function init() {
        canvas = document.getElementById('carromCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        
        setupInput();
        resetBoard();
        startLoop();
    }
    
    function resetBoard() {
        coins = [];
        score1 = 0;
        score2 = 0;
        updateUI();
        
        const cx = width / 2;
        const cy = height / 2;
        
        // Queen
        coins.push(new Circle(cx, cy, COIN_RADIUS, '#ef4444', 'queen'));
        
        const space = COIN_RADIUS * 2 + 0.5; // Tiny gap for physics stability
        
        // Inner ring (6 coins) - Alternating, forming the inner part of the Y-shape
        for (let i = 0; i < 6; i++) {
            // Even: Black, Odd: White (so White is at 60, 180, 300 degrees)
            let col = i % 2 === 0 ? '#1e293b' : '#f8fafc';
            let type = i % 2 === 0 ? 'black' : 'white';
            let ang = (Math.PI / 3) * i;
            coins.push(new Circle(cx + Math.cos(ang) * space, cy + Math.sin(ang) * space, COIN_RADIUS, col, type));
        }
        
        // Outer ring (12 coins) - Hexagonal packing
        for (let i = 0; i < 12; i++) {
            // Even (corners): White, Odd (edges): Black
            // This aligns the outer corner White coins with the inner White coins to form the Y-shape
            let col = i % 2 === 0 ? '#f8fafc' : '#1e293b';
            let type = i % 2 === 0 ? 'white' : 'black';
            let ang = (Math.PI / 6) * i;
            
            // Corners are at 2x distance, edges are at sqrt(3) distance
            let r = i % 2 === 0 ? space * 2 : space * Math.sqrt(3);
            
            coins.push(new Circle(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, COIN_RADIUS, col, type));
        }
        
        placeStriker();
    }
    
    function placeStriker() {
        const bMargin = BOARD_MARGIN + 70;
        const bGap = 22;
        let strikerY = (turn === 1) ? (height - bMargin - bGap/2) : (bMargin + bGap/2);
        let strikerColor = (turn === 1) ? '#fef08a' : '#fca5a5';
        striker = new Circle(width / 2, strikerY, STRIKER_RADIUS, strikerColor, 'striker', 1.5);
        gameState = 'idle';
        updateUI();
        
        if (gameMode === 'bot' && turn === 2) {
            setTimeout(playBotTurn, 700);
        }
    }
    
    function setupInput() {
        const slider = document.getElementById('carromAimSlider');
        const thumb = document.getElementById('carromSliderThumb');
        const powerFill = document.getElementById('carromPowerFill');
        const powerKnob = document.getElementById('carromPowerKnob');
        
        if (slider) {
            slider.addEventListener('input', (e) => {
                if (gameState !== 'idle') return;
                if (gameMode === 'bot' && turn === 2) return;
                let val = parseInt(e.target.value); // -100 to 100
                if(thumb) thumb.style.left = `${50 + (val/2)}%`;
                
                // Move striker along the baseline based on slider
                let trackWidth = width - (BOARD_MARGIN * 2) - 160;
                if(striker) striker.x = (width / 2) + (val / 100) * (trackWidth / 2);
            });
        }
        
        // Touch/Mouse on Canvas to pull back (aim and power)
        let startX = 0;
        let startY = 0;
        
        const handleStart = (e) => {
            if (gameState !== 'idle') return;
            if (gameMode === 'bot' && turn === 2) return;
            let clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            startX = clientX;
            startY = clientY;
            
            const rect = canvas.getBoundingClientRect();
            let scaleX = width / rect.width;
            let scaleY = height / rect.height;
            let canvasX = (clientX - rect.left) * scaleX;
            let canvasY = (clientY - rect.top) * scaleY;
            
            let distToStriker = Math.sqrt(Math.pow(canvasX - striker.x, 2) + Math.pow(canvasY - striker.y, 2));
            
            if (distToStriker <= STRIKER_RADIUS * 2) {
                gameState = 'placing';
            } else {
                gameState = 'aiming';
            }
            isDragging = true;
        };
        
        const handleMove = (e) => {
            if (!isDragging) return;
            if (gameMode === 'bot' && turn === 2) return;
            const rect = canvas.getBoundingClientRect();
            let scaleX = width / rect.width;
            let scaleY = height / rect.height;
            let clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            if (gameState === 'placing') {
                let dy = (startY - clientY) * scaleY;
                // If they drag vertically, transition to aiming
                if (Math.abs(dy) > 20) {
                    gameState = 'aiming';
                } else {
                    let canvasX = (clientX - rect.left) * scaleX;
                    const bMargin = BOARD_MARGIN + 70;
                    const endD = bMargin + 40;
                    let minX = endD + 14 + STRIKER_RADIUS;
                    let maxX = width - endD - 14 - STRIKER_RADIUS;
                    striker.x = Math.max(minX, Math.min(maxX, canvasX));
                }
            }
            
            if (gameState === 'aiming') {
                let dx = (startX - clientX) * scaleX;
                let dy = (startY - clientY) * scaleY;
                
                aimAngle = Math.atan2(dy, dx);
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                power = Math.min(100, (dist / 150) * 100);
                
                if(powerFill) powerFill.style.height = `${power}%`;
                if(powerKnob) powerKnob.style.bottom = `calc(${power}% + 5px)`;
            }
        };
        
        const handleEnd = () => {
            if (!isDragging) return;
            if (gameMode === 'bot' && turn === 2) {
                isDragging = false;
                return;
            }
            isDragging = false;
            
            if (gameState === 'aiming') {
                if (power > 10) {
                    shoot(power, aimAngle);
                } else {
                    gameState = 'idle';
                }
            } else if (gameState === 'placing') {
                gameState = 'idle';
            }
            
            power = 0;
            if(powerFill) powerFill.style.height = `0%`;
            if(powerKnob) powerKnob.style.bottom = `5px`;
        };
        
        canvas.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        
        canvas.addEventListener('touchstart', handleStart);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', handleEnd);
    }
    
    function shoot(p, angle) {
        scoredOwnCoin = false;
        let force = (p / 100) * 35;
        striker.vx = Math.cos(angle) * force;
        striker.vy = Math.sin(angle) * force;
        gameState = 'moving';
    }
    
    function drawBoard() {
        // Wood background
        ctx.fillStyle = '#d97743'; // Base wood color
        ctx.fillRect(0, 0, width, height);
        
        // Frame
        ctx.strokeStyle = '#4a2511';
        ctx.lineWidth = BOARD_MARGIN;
        ctx.strokeRect(BOARD_MARGIN/2, BOARD_MARGIN/2, width-BOARD_MARGIN, height-BOARD_MARGIN);
        
        // Board Markings
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        
        const bMargin = BOARD_MARGIN + 70; // Distance of outer baseline from edge
        const bGap = 22; // Gap between double lines
        const endD = bMargin + 40; // Distance from edge to start of baseline
        
        // Helper to draw double baselines and end circles
        const drawSide = (x1, y1, x2, y2, dx, dy) => {
            // Outer line
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            // Inner line
            ctx.beginPath(); ctx.moveTo(x1 + dx, y1 + dy); ctx.lineTo(x2 + dx, y2 + dy); ctx.stroke();
            
            // End circles (where the striker is placed at the corners)
            ctx.fillStyle = '#ef4444'; // Red fill
            
            // First circle
            ctx.beginPath(); ctx.arc(x1 + dx/2, y1 + dy/2, 14, 0, Math.PI*2); 
            ctx.fill(); ctx.stroke();
            // Inner decorative circle
            ctx.fillStyle = '#d97743';
            ctx.beginPath(); ctx.arc(x1 + dx/2, y1 + dy/2, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            
            // Second circle
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(x2 + dx/2, y2 + dy/2, 14, 0, Math.PI*2); 
            ctx.fill(); ctx.stroke();
            // Inner decorative circle
            ctx.fillStyle = '#d97743';
            ctx.beginPath(); ctx.arc(x2 + dx/2, y2 + dy/2, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        };

        // Top (dx=0, dy=bGap)
        drawSide(endD, bMargin, width - endD, bMargin, 0, bGap);
        // Bottom (dx=0, dy=-bGap)
        drawSide(endD, height - bMargin, width - endD, height - bMargin, 0, -bGap);
        // Left (dx=bGap, dy=0)
        drawSide(bMargin, endD, bMargin, height - endD, bGap, 0);
        // Right (dx=-bGap, dy=0)
        drawSide(width - bMargin, endD, width - bMargin, height - endD, -bGap, 0);
        
        // Diagonal arrows pointing to holes
        const arrowStart = endD + 20; 
        const arrowEnd = BOARD_MARGIN + 35;
        
        const drawArrow = (sx, sy, ex, ey) => {
            // Line
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
            // Base circle
            ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.stroke();
            // Arrow head curve
            ctx.beginPath(); ctx.arc(ex, ey, 25, 0, Math.PI*2); ctx.stroke(); 
        };
        
        drawArrow(arrowStart, arrowStart, arrowEnd, arrowEnd); // Top-left
        drawArrow(width - arrowStart, arrowStart, width - arrowEnd, arrowEnd); // Top-right
        drawArrow(arrowStart, height - arrowStart, arrowEnd, height - arrowEnd); // Bottom-left
        drawArrow(width - arrowStart, height - arrowStart, width - arrowEnd, height - arrowEnd); // Bottom-right
        
        // Center circles
        ctx.beginPath(); ctx.arc(width/2, height/2, 85, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(width/2, height/2, 105, 0, Math.PI*2); ctx.stroke();
        
        // Center flower/star decoration (simple concentric circles for now)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(width/2, height/2, 25, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(width/2, height/2, 10, 0, Math.PI*2); ctx.fill();
        
        // Holes (pockets)
        ctx.fillStyle = '#111';
        [
            [BOARD_MARGIN, BOARD_MARGIN],
            [width-BOARD_MARGIN, BOARD_MARGIN],
            [BOARD_MARGIN, height-BOARD_MARGIN],
            [width-BOARD_MARGIN, height-BOARD_MARGIN]
        ].forEach(pos => {
            ctx.beginPath();
            ctx.arc(pos[0], pos[1], HOLE_RADIUS, 0, Math.PI*2);
            ctx.fill();
        });
    }
    
    function handleCollisions() {
        // While not moving (placing, aiming, sliding), striker is ignored by physics so it NEVER pushes any coin on the baseline!
        let allObjects = (gameState === 'moving')
            ? [striker, ...coins].filter(c => c && c.active)
            : coins.filter(c => c && c.active);
        
        let isMoving = false;
        
        // Wall collisions
        const minXY = BOARD_MARGIN + COIN_RADIUS;
        const maxXY = width - BOARD_MARGIN - COIN_RADIUS;
        
        for (let obj of allObjects) {
            if (obj.vx !== 0 || obj.vy !== 0) isMoving = true;
            
            if (obj.x < minXY) { obj.x = minXY; obj.vx *= -1; }
            if (obj.x > maxXY) { obj.x = maxXY; obj.vx *= -1; }
            if (obj.y < minXY) { obj.y = minXY; obj.vy *= -1; }
            if (obj.y > maxXY) { obj.y = maxXY; obj.vy *= -1; }
            
            // Check holes
            const holes = [
                {x: BOARD_MARGIN, y: BOARD_MARGIN},
                {x: width-BOARD_MARGIN, y: BOARD_MARGIN},
                {x: BOARD_MARGIN, y: height-BOARD_MARGIN},
                {x: width-BOARD_MARGIN, y: height-BOARD_MARGIN}
            ];
            
            for (let h of holes) {
                let dx = obj.x - h.x;
                let dy = obj.y - h.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < HOLE_RADIUS) {
                    obj.active = false;
                    if (obj.type === 'striker') {
                        // Foul: penalty point if possible
                        if (turn === 1 && score1 > 0) score1--;
                        else if (turn === 2 && score2 > 0) score2--;
                        scoredOwnCoin = false;
                        updateUI();
                    } else {
                        // Scored by piece type
                        if (obj.type === 'white') {
                            score1++; // White point always to Player 1 (White)
                            if (turn === 1) scoredOwnCoin = true;
                        } else if (obj.type === 'black') {
                            score2++; // Black point always to Player 2 (Black)
                            if (turn === 2) scoredOwnCoin = true;
                        } else if (obj.type === 'queen' || obj.type === 'red') {
                            if (turn === 1) score1 += 3; else score2 += 3;
                            scoredOwnCoin = true;
                        }
                        updateUI();
                        if (score1 >= 9) {
                            setTimeout(() => {
                                alert("অভিনন্দন! আপনি ক্যারমে জিতেছেন!");
                                if (typeof window.recordGameResult === 'function') window.recordGameResult('carrom', true);
                            }, 100);
                        }
                    }
                }
            }
        }
        
        // Circle collisions (O(N^2) naive approach is fine for 20 coins)
        for (let i = 0; i < allObjects.length; i++) {
            for (let j = i + 1; j < allObjects.length; j++) {
                let c1 = allObjects[i];
                let c2 = allObjects[j];
                
                let dx = c2.x - c1.x;
                let dy = c2.y - c1.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                let minDist = c1.radius + c2.radius;
                
                if (dist < minDist) {
                    // Resolve overlap
                    let overlap = minDist - dist;
                    let nx = dx / dist;
                    let ny = dy / dist;
                    
                    c1.x -= nx * (overlap/2);
                    c1.y -= ny * (overlap/2);
                    c2.x += nx * (overlap/2);
                    c2.y += ny * (overlap/2);
                    
                    // Momentum conservation
                    let p = 2 * (c1.vx * nx + c1.vy * ny - c2.vx * nx - c2.vy * ny) / (c1.mass + c2.mass);
                    c1.vx -= p * c2.mass * nx;
                    c1.vy -= p * c2.mass * ny;
                    c2.vx += p * c1.mass * nx;
                    c2.vy += p * c1.mass * ny;
                }
            }
        }
        
        if (gameState === 'moving' && !isMoving) {
            if (checkGameOver()) {
                gameState = 'idle';
                return;
            }
            // Turn over: If player did NOT pocket their own coin, turn switches to opponent!
            if (!scoredOwnCoin) {
                turn = turn === 1 ? 2 : 1;
            }
            scoredOwnCoin = false;
            placeStriker();
            updateUI();
        }
    }
    
    function drawAiming() {
        if (gameState !== 'aiming') return;
        
        let remLen = 80 + (power * 8); // Scale line length
        let curX = striker.x;
        let curY = striker.y;
        let dirX = Math.cos(aimAngle);
        let dirY = Math.sin(aimAngle);
        
        const minX = BOARD_MARGIN + STRIKER_RADIUS;
        const maxX = width - BOARD_MARGIN - STRIKER_RADIUS;
        const minY = BOARD_MARGIN + STRIKER_RADIUS;
        const maxY = height - BOARD_MARGIN - STRIKER_RADIUS;
        
        ctx.beginPath();
        ctx.moveTo(curX, curY);
        
        let endX = curX;
        let endY = curY;
        let maxBounces = 10;
        let hitCoin = null;
        
        // Raycast loop for bounces and coin collisions
        while (remLen > 0 && maxBounces > 0) {
            let tX = Infinity, tY = Infinity;
            
            if (dirX > 0.0001) tX = (maxX - curX) / dirX;
            else if (dirX < -0.0001) tX = (minX - curX) / dirX;
            
            if (dirY > 0.0001) tY = (maxY - curY) / dirY;
            else if (dirY < -0.0001) tY = (minY - curY) / dirY;
            
            let tWall = Math.min(tX, tY);
            let tCoin = Infinity;
            let closestCoin = null;
            
            for (let c of coins) {
                if (!c || !c.active) continue;
                let dx = c.x - curX;
                let dy = c.y - curY;
                let proj = dx * dirX + dy * dirY;
                if (proj <= 0) continue;
                
                let distSq = (dx * dx + dy * dy) - (proj * proj);
                let R = c.radius + STRIKER_RADIUS;
                if (distSq < R * R) {
                    let halfChord = Math.sqrt(R * R - distSq);
                    let t = proj - halfChord;
                    if (t > 0.01 && t < tCoin) {
                        tCoin = t;
                        closestCoin = c;
                    }
                }
            }
            
            let tNext = Math.min(tWall, tCoin);
            
            if (tNext > remLen) {
                // No more bounces or collisions within remaining length
                curX += dirX * remLen;
                curY += dirY * remLen;
                ctx.lineTo(curX, curY);
                endX = curX;
                endY = curY;
                break;
            } else if (tCoin < tWall) {
                // Collide with a coin
                curX += dirX * tCoin;
                curY += dirY * tCoin;
                ctx.lineTo(curX, curY);
                endX = curX;
                endY = curY;
                hitCoin = closestCoin;
                break;
            } else {
                // Bounce off wall
                curX += dirX * tWall;
                curY += dirY * tWall;
                ctx.lineTo(curX, curY);
                remLen -= tWall;
                
                // Reflect direction
                if (tWall === tX) dirX = -dirX;
                if (tWall === tY) dirY = -dirY;
                
                // Nudge slightly off the wall to prevent floating point infinite loops
                curX += dirX * 0.01;
                curY += dirY * 0.01;
                maxBounces--;
            }
        }
        
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
        
        if (hitCoin) {
            // Draw striker ghost circle at aim target
            ctx.beginPath();
            ctx.arc(endX, endY, STRIKER_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Small center dot for striker impact point
            ctx.beginPath();
            ctx.arc(endX, endY, 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();

            // Calculate coin trajectory direction
            let nx = hitCoin.x - endX;
            let ny = hitCoin.y - endY;
            let nLen = Math.sqrt(nx * nx + ny * ny);
            if (nLen > 0.0001) {
                nx /= nLen;
                ny /= nLen;
                
                // Highlight the hit coin slightly
                ctx.beginPath();
                ctx.arc(hitCoin.x, hitCoin.y, hitCoin.radius + 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Draw target coin predicted trajectory line
                ctx.beginPath();
                ctx.moveTo(hitCoin.x, hitCoin.y);
                let coinTargetLen = Math.max(30, Math.min(70, remLen * 0.85));
                ctx.lineTo(hitCoin.x + nx * coinTargetLen, hitCoin.y + ny * coinTargetLen);
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)'; // yellow gold color for coin path
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.setLineDash([]);

                // Target coin path indicator dot
                ctx.beginPath();
                ctx.arc(hitCoin.x + nx * coinTargetLen, hitCoin.y + ny * coinTargetLen, 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
                ctx.fill();
            }
        } else {
            // Draw small circle at aim target when no coin is hit
            ctx.beginPath();
            ctx.arc(endX, endY, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fill();
        }
    }
    
    function update() {
        ctx.clearRect(0, 0, width, height);
        
        drawBoard();
        
        if (striker && striker.active) striker.update();
        coins.forEach(c => c.update());
        
        handleCollisions();
        
        if (striker && striker.active) striker.draw(ctx);
        coins.forEach(c => c.draw(ctx));
        
        drawAiming();
        
        animationId = requestAnimationFrame(update);
    }
    
    function startLoop() {
        if (animationId) cancelAnimationFrame(animationId);
        update();
    }
    
    function checkGameOver() {
        let whiteLeft = coins.filter(c => c && c.active && c.type === 'white').length;
        let blackLeft = coins.filter(c => c && c.active && c.type === 'black').length;
        
        if (whiteLeft === 0 || blackLeft === 0) {
            const overlay = document.getElementById('carromGameOverOverlay');
            const winnerTxt = document.getElementById('carromWinnerText');
            if (overlay && winnerTxt) {
                if (whiteLeft === 0) {
                    winnerTxt.innerText = 'অভিনন্দন! আপনি সব সাদা গুটি পকেটে ফেলেছেন - আপনি বিজয়ী! 🏆';
                    winnerTxt.style.color = '#22c55e';
                } else {
                    winnerTxt.innerText = (gameMode === 'bot') ? 'বট বিজয়ী! সব কালো গুটি পকেটে ফেলেছে 🤖' : 'প্লেয়ার ২ বিজয়ী! 🏆';
                    winnerTxt.style.color = '#ef4444';
                }
                overlay.style.display = 'flex';
            }
            return true;
        }
        return false;
    }

    function isPathClear(x1, y1, x2, y2, ignoreCoin) {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return true;
        let nx = dx / len;
        let ny = dy / len;
        
        for (let c of coins) {
            if (!c || !c.active || c === ignoreCoin || c.type === 'striker') continue;
            let vx = c.x - x1;
            let vy = c.y - y1;
            let proj = vx * nx + vy * ny;
            if (proj > c.radius && proj < len - c.radius) {
                let distSq = (vx * vx + vy * vy) - (proj * proj);
                if (distSq < (c.radius + 10) * (c.radius + 10)) {
                    return false; // Path obstructed
                }
            }
        }
        return true;
    }

    function isBaselinePositionValid(x, y) {
        for (let c of coins) {
            if (!c || !c.active) continue;
            let dx = c.x - x;
            let dy = c.y - y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < COIN_RADIUS + STRIKER_RADIUS + 4) {
                return false; // Covered by a coin on baseline
            }
        }
        return true;
    }

    function getValidBaselineX(desiredX, y, minX, maxX) {
        if (isBaselinePositionValid(desiredX, y)) return desiredX;
        for (let offset = 5; offset < (maxX - minX); offset += 5) {
            let leftX = Math.max(minX, desiredX - offset);
            if (isBaselinePositionValid(leftX, y)) return leftX;
            let rightX = Math.min(maxX, desiredX + offset);
            if (isBaselinePositionValid(rightX, y)) return rightX;
        }
        return desiredX;
    }

    function playBotTurn() {
        if (gameState !== 'idle' || turn !== 2 || !striker || !striker.active) return;
        
        // BOT ONLY TARGETS BLACK COINS and QUEEN (red)
        let activeCoins = coins.filter(c => c && c.active && (c.type === 'black' || c.type === 'queen' || c.type === 'red'));
        if (activeCoins.length === 0) return;
        
        const bMargin = BOARD_MARGIN + 70;
        const endD = bMargin + 40;
        const minX = endD + 14 + STRIKER_RADIUS;
        const maxX = width - endD - 14 - STRIKER_RADIUS;
        
        const holes = [
            {x: BOARD_MARGIN, y: BOARD_MARGIN},
            {x: width - BOARD_MARGIN, y: BOARD_MARGIN},
            {x: BOARD_MARGIN, y: height - BOARD_MARGIN},
            {x: width - BOARD_MARGIN, y: height - BOARD_MARGIN}
        ];
        
        // Smart shot evaluation like a real player
        let bestCoin = activeCoins[0];
        let bestHole = holes[2];
        let bestScore = -999999;
        let bestTargetX = width / 2;
        let bestAngle = Math.PI / 2;
        let bestPower = 65;
        
        for (let c of activeCoins) {
            for (let h of holes) {
                let angleToHole = Math.atan2(h.y - c.y, h.x - c.x);
                let impactX = c.x - Math.cos(angleToHole) * (c.radius + STRIKER_RADIUS);
                let impactY = c.y - Math.sin(angleToHole) * (c.radius + STRIKER_RADIUS);
                
                let testX = Math.max(minX, Math.min(maxX, impactX));
                let dy = impactY - striker.y;
                let dx = impactX - testX;
                
                // Can only shoot downwards from top baseline
                if (dy < 12) continue;
                
                let angle = Math.atan2(dy, dx);
                let dist1 = Math.sqrt(dx * dx + dy * dy);
                let dist2 = Math.sqrt(Math.pow(h.x - c.x, 2) + Math.pow(h.y - c.y, 2));
                let totalDist = dist1 + dist2;
                
                let clearStrikerToCoin = isPathClear(testX, striker.y, impactX, impactY, c);
                let clearCoinToPocket = isPathClear(c.x, c.y, h.x, h.y, c);
                
                let score = 0;
                if (clearStrikerToCoin && clearCoinToPocket) {
                    score = 1000 - totalDist;
                } else if (clearStrikerToCoin) {
                    score = 400 - totalDist;
                } else {
                    score = 100 - totalDist;
                }
                
                // Queen bonus priority
                if (c.type === 'queen' || c.type === 'red') score += 150;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestCoin = c;
                    bestHole = h;
                    bestTargetX = testX;
                    bestAngle = angle;
                    bestPower = Math.min(88, Math.max(48, (totalDist / 400) * 78));
                }
            }
        }
        
        // Fallback if no valid downward shot found
        if (bestScore === -999999) {
            bestCoin = activeCoins[0];
            let dx = bestCoin.x - striker.x;
            let dy = Math.max(20, bestCoin.y - striker.y);
            bestAngle = Math.atan2(dy, dx);
            bestPower = 60;
            bestTargetX = Math.max(minX, Math.min(maxX, bestCoin.x));
        }
        
        // Ensure striker is placed on an open spot on the baseline that does not overlap with any coin sitting there
        let targetX = getValidBaselineX(bestTargetX, striker.y, minX, maxX);
        let targetAngle = bestAngle;
        let targetPower = bestPower;
        
        // Step 1: Smoothly slide striker to targetX (human-like ease)
        let startX = striker.x;
        let slideStartTime = null;
        let slideDuration = 450; // ms
        
        function animateSlide(timestamp) {
            if (!slideStartTime) slideStartTime = timestamp;
            let elapsed = timestamp - slideStartTime;
            let progress = Math.min(1, elapsed / slideDuration);
            let ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            if (striker && striker.active) {
                striker.x = startX + (targetX - startX) * ease;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animateSlide);
            } else {
                // Step 2: Start Aiming after a short human-like pause
                setTimeout(() => {
                    if (turn !== 2 || !striker || !striker.active) return;
                    gameState = 'aiming';
                    aimAngle = Math.PI / 2; // Start aiming straight down
                    power = 15;
                    
                    let aimStartTime = null;
                    let aimDuration = 550; // ms
                    let initialAngle = Math.PI / 2;
                    
                    function animateAim(timestamp) {
                        if (!aimStartTime) aimStartTime = timestamp;
                        let elapsed = timestamp - aimStartTime;
                        let progress = Math.min(1, elapsed / aimDuration);
                        let ease = 1 - Math.pow(1 - progress, 3); // ease-out
                        
                        aimAngle = initialAngle + (targetAngle - initialAngle) * ease;
                        power = Math.min(targetPower, 15 + (targetPower - 15) * ease);
                        
                        if (progress < 1) {
                            requestAnimationFrame(animateAim);
                        } else {
                            // Step 3: HOLD STEADY for 250ms like a real player locking in!
                            setTimeout(() => {
                                if (turn !== 2 || !striker || !striker.active) return;
                                let finalPower = power;
                                let finalAngle = aimAngle;
                                power = 0;
                                shoot(finalPower, finalAngle);
                            }, 250);
                        }
                    }
                    requestAnimationFrame(animateAim);
                }, 200);
            }
        }
        requestAnimationFrame(animateSlide);
    }

    function updateUI() {
        const s1 = document.getElementById('carromScore1');
        const s2 = document.getElementById('carromScore2');
        if (s1) s1.innerText = score1.toString().padStart(2, '0');
        if (s2) s2.innerText = score2.toString().padStart(2, '0');
        
        const turnInd = document.getElementById('carromTurnIndicator');
        if (turnInd) {
            let text = turn === 1 ? 'YOUR TURN (সাদা)' : (gameMode === 'bot' ? 'BOT TURN (কালো)' : 'PLAYER 2 TURN (কালো)');
            let icon = turn === 1 ? 'fas fa-circle' : (gameMode === 'bot' ? 'fas fa-robot' : 'fas fa-circle');
            let color = turn === 1 ? '#eab308' : '#fca5a5';
            turnInd.innerHTML = `<i class="${icon}" style="font-size: 8px; margin-right: 5px;"></i> ${text}`;
            turnInd.style.color = color;
            turnInd.style.borderColor = color;
        }

        const p1Name = document.getElementById('carromPlayer1Name');
        if (p1Name) {
            const userName = window.CURRENT_USER_NAME || 'PLAYER 1';
            p1Name.innerText = userName + ' (সাদা)';
        }

        const p2Name = document.getElementById('carromPlayer2Name');
        const p2Icon = document.getElementById('carromPlayer2Icon');
        if (p2Name) {
            p2Name.innerText = (gameMode === 'bot') ? 'CARROM BOT (কালো)' : 'PLAYER 2 (কালো)';
        }
        if (p2Icon) {
            p2Icon.className = (gameMode === 'bot') ? 'fas fa-robot' : 'fas fa-user';
        }
    }

    return {
        init: (mode = 'bot') => {
            gameMode = mode;
            if(!canvas) init();
            else {
                turn = 1;
                resetBoard();
            }
        },
        setMode: (mode = 'bot') => {
            gameMode = mode;
            turn = 1;
            resetBoard();
        },
        resetGame: () => {
            turn = 1;
            resetBoard();
        }
    };
})();

// Global init wrapper
function initCarrom(mode = 'bot') {
    if (typeof carromGame !== 'undefined') {
        carromGame.init(mode);
    }
}
