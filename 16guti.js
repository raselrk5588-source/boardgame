const gutiGame = (function() {
    let nodes = [];
    let board = new Array(33).fill(0);
    let currentPlayer = 1; // 1 = Red, 2 = Blue
    let selectedNode = null;
    let mustJumpNode = null;
    let gameMode = 'local'; // 'local', 'bot', 'online'
    let opponentName = '১৬ গুটি বট';
    let isBotThinking = false;
    
    // UI Elements
    let container, svg, piecesLayer, validMovesLayer;

    function initNodes() {
        nodes = [];
        let id = 0;
        // 37 nodes based on SVG reference
        for (let y = 0; y <= 8; y++) {
            for (let x = 0; x <= 4; x++) {
                // Row 0 & 8: only x=0, 2, 4 (wide triangle tips)
                if ((y === 0 || y === 8) && (x === 1 || x === 3)) continue;
                // Row 1 & 7: only x=1, 2, 3 (narrow triangle middle)
                if ((y === 1 || y === 7) && (x === 0 || x === 4)) continue;
                // Rows 2-6: all x values (full 5x5 grid)
                nodes.push({ id: id++, x, y });
            }
        }
    }

    function isValidEdge(n1, n2) {
        const dx = Math.abs(n1.x - n2.x);
        const dy = Math.abs(n1.y - n2.y);
        const minY = Math.min(n1.y, n2.y);
        const maxY = Math.max(n1.y, n2.y);

        // --- Horizontal edges (same row) ---
        if (dy === 0) {
            if (dx === 1) return true;
            // Special: rows 0 & 8 have dx=2 edges (x=0↔2, x=2↔4)
            if (dx === 2 && (n1.y === 0 || n1.y === 8)) return true;
            return false;
        }

        // --- Vertical edges (same column, dy=1) ---
        if (dx === 0 && dy === 1) {
            // x=2 column runs full length y=0 to y=8
            if (n1.x === 2) return true;
            // x=1,3 columns: only within grid rows 2-6
            if (n1.x === 1 || n1.x === 3) {
                return minY >= 2 && maxY <= 6;
            }
            // x=0,4 columns: only within grid rows 2-6
            if (n1.x === 0 || n1.x === 4) {
                return minY >= 2 && maxY <= 6;
            }
            return false;
        }

        // --- Diagonal edges (dx=1, dy=1) ---
        if (dx === 1 && dy === 1) {
            // Within 5x5 grid (rows 2-6): alternating single-diagonal pattern
            if (minY >= 2 && maxY <= 6) {
                return (n1.x + n1.y) % 2 === 0;
            }
            // Top triangle (rows 0-1): only corners connect diagonally
            // (0,0)↔(1,1) and (4,0)↔(3,1) — row-0 node must NOT be x=2
            if (minY === 0 && maxY === 1) {
                const r0 = n1.y === 0 ? n1 : n2;
                return r0.x !== 2;
            }
            // Row 1↔2: only diagonals connecting TO x=2 in row 2
            // (1,1)↔(2,2) and (3,1)↔(2,2)
            if (minY === 1 && maxY === 2) {
                const r2 = n1.y === 2 ? n1 : n2;
                return r2.x === 2;
            }
            // Row 6↔7: only diagonals connecting FROM x=2 in row 6
            if (minY === 6 && maxY === 7) {
                const r6 = n1.y === 6 ? n1 : n2;
                return r6.x === 2;
            }
            // Bottom triangle (rows 7-8): corners connect diagonally
            // (0,8)↔(1,7) and (4,8)↔(3,7) — row-8 node must NOT be x=2
            if (minY === 7 && maxY === 8) {
                const r8 = n1.y === 8 ? n1 : n2;
                return r8.x !== 2;
            }
            return false;
        }

        return false;
    }

    function getJump(n1, n3) {
        // Midpoint must exist and be at integer coordinates
        const midX = (n1.x + n3.x) / 2;
        const midY = (n1.y + n3.y) / 2;
        if (midX !== Math.floor(midX) || midY !== Math.floor(midY)) return null;

        const midNode = nodes.find(n => n.x === midX && n.y === midY);
        if (!midNode) return null;

        // Both halves must be valid edges
        if (!isValidEdge(n1, midNode) || !isValidEdge(midNode, n3)) return null;

        return midNode;
    }

    function renderBoard() {
        container = document.getElementById('gutiBoardContainer');
        container.innerHTML = '';
        
        // Create an aspect-ratio container
        const aspectWrapper = document.createElement('div');
        aspectWrapper.style.height = '100%';
        aspectWrapper.style.maxHeight = '100%';
        aspectWrapper.style.width = 'auto'; // Let height and aspect ratio determine width
        aspectWrapper.style.aspectRatio = '4 / 8';
        aspectWrapper.style.position = 'relative';
        
        // Create SVG for lines
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        
        // Draw lines
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                if (isValidEdge(nodes[i], nodes[j])) {
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', `${nodes[i].x * 25}%`);
                    line.setAttribute('y1', `${nodes[i].y * 12.5}%`);
                    line.setAttribute('x2', `${nodes[j].x * 25}%`);
                    line.setAttribute('y2', `${nodes[j].y * 12.5}%`);
                    line.setAttribute('stroke', '#c9a44a'); // Golden amber for dark board
                    line.setAttribute('stroke-width', '2.5');
                    line.setAttribute('stroke-linecap', 'round');
                    svg.appendChild(line);
                }
            }
        }
        
        piecesLayer = document.createElement('div');
        piecesLayer.style.position = 'absolute';
        piecesLayer.style.width = '100%';
        piecesLayer.style.height = '100%';
        piecesLayer.style.pointerEvents = 'none'; // let valid moves be clickable
        
        validMovesLayer = document.createElement('div');
        validMovesLayer.style.position = 'absolute';
        validMovesLayer.style.width = '100%';
        validMovesLayer.style.height = '100%';
        
        aspectWrapper.appendChild(svg);
        aspectWrapper.appendChild(validMovesLayer);
        aspectWrapper.appendChild(piecesLayer);
        container.appendChild(aspectWrapper);
        
        updatePieces();
    }

    function updatePieces() {
        piecesLayer.innerHTML = '';
        let redCount = 0;
        let greenCount = 0;

        board.forEach((val, index) => {
            if (val > 0) {
                if (val === 1) redCount++;
                if (val === 2) greenCount++;

                const p = document.createElement('div');
                p.className = `guti-piece ${val === 1 ? 'red' : 'green'} ${selectedNode === index ? 'selected' : ''}`;
                p.style.left = `${nodes[index].x * 25}%`;
                p.style.top = `${nodes[index].y * 12.5}%`;
                p.style.pointerEvents = 'auto'; // make piece clickable
                
                p.onclick = () => onPieceClick(index);
                piecesLayer.appendChild(p);
            }
        });

        // Update scores
        document.getElementById('gutiScoreRed').innerText = `${redCount} গুটি`;
        document.getElementById('gutiScoreBlue').innerText = `${greenCount} গুটি`;
    }

    function onPieceClick(index) {
        if (gameMode === 'bot' && currentPlayer === 2) return;
        if (board[index] !== currentPlayer) return;
        if (mustJumpNode !== null && mustJumpNode !== index) return;

        const moves = getAvailableMoves(index);
        if (moves.length === 0) return; // This piece can't do anything

        selectedNode = index;
        updatePieces();
        showValidMoves();
    }

    function showValidMoves() {
        validMovesLayer.innerHTML = '';
        if (selectedNode === null) return;
        
        const moves = getAvailableMoves(selectedNode);
        
        moves.forEach(move => {
            const m = document.createElement('div');
            m.className = 'guti-valid-move';
            m.style.left = `${nodes[move.to].x * 25}%`;
            m.style.top = `${nodes[move.to].y * 12.5}%`;
            m.onclick = () => executeMove(selectedNode, move.to, move.capture);
            validMovesLayer.appendChild(m);
        });
    }

    // Check if a specific piece can capture
    function pieceCanCapture(fromIndex) {
        const n1 = nodes[fromIndex];
        for (let j = 0; j < nodes.length; j++) {
            if (board[j] === 0) {
                const midNode = getJump(n1, nodes[j]);
                if (midNode) {
                    const midVal = board[midNode.id];
                    if (midVal > 0 && midVal !== board[fromIndex]) return true;
                }
            }
        }
        return false;
    }

    // Check if any piece of a player can capture
    function anyPieceCanCapture(player) {
        for (let i = 0; i < nodes.length; i++) {
            if (board[i] === player && pieceCanCapture(i)) return true;
        }
        return false;
    }

    // Check if current player can move at all
    function canPlayerMove(player) {
        for (let i = 0; i < nodes.length; i++) {
            if (board[i] === player) {
                const n1 = nodes[i];
                // Check simple moves
                for (let j = 0; j < nodes.length; j++) {
                    if (board[j] === 0 && isValidEdge(n1, nodes[j])) return true;
                }
                // Check jumps
                if (pieceCanCapture(i)) return true;
            }
        }
        return false;
    }

    function getAvailableMoves(fromIndex) {
        const n1 = nodes[fromIndex];
        let jumps = [];
        let simpleMoves = [];
        
        // Always check for jumps first
        nodes.forEach((n3, toIndex) => {
            if (board[toIndex] === 0) {
                const midNode = getJump(n1, n3);
                if (midNode) {
                    const midVal = board[midNode.id];
                    if (midVal > 0 && midVal !== board[fromIndex]) {
                        jumps.push({ to: toIndex, capture: midNode.id });
                    }
                }
            }
        });
        
        // If this piece can jump, return jumps (player can choose)
        // If in multi-jump mode, only jumps from that node allowed
        if (mustJumpNode !== null) {
            return jumps;
        }
        
        // Simple moves
        nodes.forEach((n2, toIndex) => {
            if (board[toIndex] === 0 && isValidEdge(n1, n2)) {
                simpleMoves.push({ to: toIndex, capture: null });
            }
        });
        
        // Return both jumps and simple moves — player can choose freely
        return [...jumps, ...simpleMoves];
    }

    // Move history for undo
    let moveHistory = [];

    function executeMove(from, to, capture) {
        // Save state for undo
        moveHistory.push({
            from, to, capture,
            player: currentPlayer,
            capturedPiece: capture !== null ? board[capture] : null
        });

        board[to] = board[from];
        board[from] = 0;
        
        if (capture !== null) {
            board[capture] = 0;
            selectedNode = to;
            updatePieces();
            
            // Check if another jump is possible from landing spot
            const furtherJumps = [];
            nodes.forEach((n3, toIndex) => {
                if (board[toIndex] === 0) {
                    const midNode = getJump(nodes[to], n3);
                    if (midNode) {
                        const midVal = board[midNode.id];
                        if (midVal > 0 && midVal !== board[to]) {
                            furtherJumps.push({ to: toIndex, capture: midNode.id });
                        }
                    }
                }
            });
            
            if (furtherJumps.length > 0) {
                mustJumpNode = to;
                showValidMoves();
                if (gameMode === 'bot' && currentPlayer === 2) {
                    triggerBotMove();
                }
                return; // Must continue jumping — don't switch turn
            }
        }
        
        // End of turn — switch player
        selectedNode = null;
        mustJumpNode = null;
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        validMovesLayer.innerHTML = '';
        
        updateTurnIndicator();
        updatePieces();
        
        // Check win/loss conditions
        checkGameOver();

        if (gameMode === 'bot' && currentPlayer === 2) {
            triggerBotMove();
        }
    }

    function triggerBotMove() {
        setTimeout(() => {
            makeBotMove();
        }, 500);
    }

    function makeBotMove() {
        if (currentPlayer !== 2) return;

        // If in multi-jump mode, must continue from mustJumpNode
        if (mustJumpNode !== null) {
            const moves = getAvailableMoves(mustJumpNode);
            const captureMoves = moves.filter(m => m.capture !== null);
            if (captureMoves.length > 0) {
                const bestMove = captureMoves[Math.floor(Math.random() * captureMoves.length)];
                executeMove(mustJumpNode, bestMove.to, bestMove.capture);
                return;
            }
        }

        // Collect all possible moves for Green (2)
        let captureMoves = [];
        let simpleMoves = [];

        for (let i = 0; i < nodes.length; i++) {
            if (board[i] === 2) {
                const moves = getAvailableMoves(i);
                moves.forEach(m => {
                    if (m.capture !== null) {
                        captureMoves.push({ from: i, to: m.to, capture: m.capture });
                    } else {
                        simpleMoves.push({ from: i, to: m.to, capture: null });
                    }
                });
            }
        }

        let chosenMove = null;
        if (captureMoves.length > 0) {
            chosenMove = captureMoves[Math.floor(Math.random() * captureMoves.length)];
        } else if (simpleMoves.length > 0) {
            // Sort by advancing forward (y increasing for Green)
            simpleMoves.sort((a, b) => {
                let diffA = nodes[a.to].y - nodes[a.from].y;
                let diffB = nodes[b.to].y - nodes[b.from].y;
                return diffB - diffA;
            });
            const topCandidates = simpleMoves.slice(0, Math.min(3, simpleMoves.length));
            chosenMove = topCandidates[Math.floor(Math.random() * topCandidates.length)];
        }

        if (chosenMove) {
            executeMove(chosenMove.from, chosenMove.to, chosenMove.capture);
        }
    }

    function updatePlayerBarUI() {
        const redName = document.getElementById('gutiRedPlayerName');
        const greenName = document.getElementById('gutiGreenPlayerName');
        const greenAvatar = document.getElementById('gutiGreenAvatar');
        const greenSubtext = document.getElementById('gutiGreenSubtext');
        const gutiTitle = document.getElementById('gutiScreenTitle');
        
        if (redName) {
            if (gameMode === 'local') {
                redName.innerHTML = 'লাল (লোকাল) <i class="fas fa-user" style="color:#9ca3af; font-size:12px;"></i>';
            } else {
                const userName = window.CURRENT_USER_NAME || 'খেলোয়াড়';
                redName.innerHTML = userName + ' <i class="fas fa-flag text-green"></i>';
            }
        }
        if (greenName) {
            if (gameMode === 'bot') {
                greenName.innerHTML = opponentName + ' <i class="fas fa-robot" style="color:#9ca3af; font-size:12px;"></i>';
                if (greenAvatar) greenAvatar.innerHTML = '<i class="fas fa-robot"></i>';
                if (greenSubtext) greenSubtext.innerText = '🤖 ১৬ গুটি AI';
                if (gutiTitle) gutiTitle.innerText = 'বট ম্যাচ';
            } else if (gameMode === 'local') {
                greenName.innerHTML = 'সবুজ <i class="fas fa-user" style="color:#9ca3af; font-size:12px;"></i>';
                if (greenAvatar) greenAvatar.innerHTML = '<i class="fas fa-user"></i>';
                if (greenSubtext) greenSubtext.innerText = '👤 লোকাল প্লেয়ার';
                if (gutiTitle) gutiTitle.innerText = 'লোকাল ম্যাচ';
            } else {
                greenName.innerHTML = opponentName + ' <i class="fas fa-globe" style="color:#9ca3af; font-size:12px;"></i>';
                if (greenAvatar) greenAvatar.innerHTML = '<i class="fas fa-user"></i>';
                if (greenSubtext) greenSubtext.innerText = '🌐 অনলাইন প্লেয়ার';
                if (gutiTitle) gutiTitle.innerText = 'অনলাইন ম্যাচ';
            }
        }
    }

    function undoMove() {
        if (moveHistory.length === 0) return;
        
        // Undo all moves in current chain (multi-jump)
        let lastPlayer = moveHistory[moveHistory.length - 1].player;
        
        while (moveHistory.length > 0) {
            const last = moveHistory[moveHistory.length - 1];
            if (last.player !== lastPlayer) break;
            
            moveHistory.pop();
            board[last.from] = board[last.to];
            board[last.to] = 0;
            if (last.capture !== null) {
                board[last.capture] = last.capturedPiece;
            }
        }
        
        currentPlayer = lastPlayer;
        selectedNode = null;
        mustJumpNode = null;
        validMovesLayer.innerHTML = '';
        updateTurnIndicator();
        updatePieces();
    }

    function updateTurnIndicator() {
        const turnInd = document.getElementById('gutiTurnIndicator');
        if (!turnInd) return;
        if (currentPlayer === 1) {
            let label = gameMode === 'local' ? 'লাল' : 'আপনার';
            let suffix = gameMode === 'local' ? ' চালবে' : ' চাল';
            turnInd.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> <span>' + label + suffix + '</span>';
            turnInd.style.color = '#ef4444';
        } else {
            let label = gameMode === 'local' ? 'সবুজ চালবে' : opponentName + ' চালবে';
            turnInd.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> <span>' + label + '</span>';
            turnInd.style.color = '#10b981';
        }
    }

    function showGutiGameOver(icon, title, msg) {
        const modal = document.getElementById('gutiGameOverModal');
        document.getElementById('gutiModalIcon').innerText = icon;
        document.getElementById('gutiModalTitle').innerText = title;
        document.getElementById('gutiModalMsg').innerText = msg;
        modal.style.display = 'flex';
        if (typeof window.recordGameResult === 'function') {
            window.recordGameResult('guti', title.includes('লাল') || title.includes('আপনি') || title.includes('জিতেছে'));
        }
    }

    function checkGameOver() {
        let redCount = 0, greenCount = 0;
        board.forEach(v => { if (v === 1) redCount++; if (v === 2) greenCount++; });
        
        if (redCount === 0) {
            setTimeout(() => {
                showGutiGameOver('🟢', 'সবুজ জিতেছে!', 'সব লাল গুটি ধরা হয়েছে!');
            }, 400);
            return;
        }
        if (greenCount === 0) {
            setTimeout(() => {
                showGutiGameOver('🔴', 'লাল জিতেছে!', 'সব সবুজ গুটি ধরা হয়েছে!');
            }, 400);
            return;
        }
        
        // No-move check
        if (!canPlayerMove(currentPlayer)) {
            const winner = currentPlayer === 1 ? 'সবুজ' : 'লাল';
            const loser = currentPlayer === 1 ? 'লাল' : 'সবুজ';
            setTimeout(() => {
                showGutiGameOver('🎉', winner + ' জিতেছে!', loser + ' আর চলতে পারছে না!');
            }, 400);
        }
    }

    function resetGame() {
        initNodes();
        board.length = 37;
        board.fill(0);
        for (let i = 0; i < 37; i++) {
            let n = nodes[i];
            if (n.y <= 3) {
                board[i] = 2; // Green (rows 0,1,2,3 = 3+3+5+5 = 16)
            } else if (n.y >= 5) {
                board[i] = 1; // Red (rows 5,6,7,8 = 5+5+3+3 = 16)
            } else {
                board[i] = 0; // Middle row 4 = all empty (5 spots)
            }
        }
        currentPlayer = 1;
        selectedNode = null;
        mustJumpNode = null;
        moveHistory = [];
        
        updatePlayerBarUI();
        updateTurnIndicator();
        renderBoard();
    }

    return {
        init: () => {
            if(nodes.length === 0) resetGame();
        },
        resetGame: resetGame,
        undoMove: undoMove,
        setMode: (mode, name) => {
            gameMode = mode || 'local';
            if (name) opponentName = name;
            resetGame();
        }
    };

})();
