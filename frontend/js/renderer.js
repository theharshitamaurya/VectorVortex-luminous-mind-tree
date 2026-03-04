/**
 * Rendering System - Handles all visual rendering
 */
class Renderer {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.game.width, this.game.height);
        
        // Apply camera offset for all world elements (including ground)
        this.ctx.save();
        this.ctx.translate(this.game.cameraOffset.x, this.game.cameraOffset.y);
        
        this.renderGround();
        this.renderTrunk();
        this.renderBranches();
        this.renderLeaves();
        this.renderFruits();
        this.renderFallingFruits();
        this.renderFlowers();
        this.renderLightSource();
        
        if ((this.game.currentTool === 'growth' || this.game.currentTool === 'leaves' || this.game.currentTool === 'fruit' || this.game.currentTool === 'flower' || this.game.currentTool === 'reposition' || this.game.currentTool === 'study' || this.game.currentTool === 'pan') && this.game.hoveredNode) {
            this.renderHoveredNode();
        }
        
        // Render highlighted node (from flashcard linking)
        if (this.game.highlightedNode) {
            this.renderHighlightedNode();
        }
        
        // Render tooltip for any tool when hovering over nodes with search results
        if (this.game.hoveredNode && this.game.hoveredNode.searchResult) {
            this.renderTooltip(this.game.hoveredNode.searchResult, this.game.hoveredNode.x, this.game.hoveredNode.y);
        }
        
        this.ctx.restore();
        
        // Render cut tool visual (outside camera transform, in screen coordinates)
        if (this.game.currentTool === 'cut' && this.game.isDragging && this.game.dragStart && this.game.dragEnd) {
            console.log('RENDERING CUT TOOL VISUAL:', this.game.dragStart, this.game.dragEnd);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            // Use screen coordinates directly (no camera offset needed)
            this.ctx.moveTo(this.game.dragStart.x, this.game.dragStart.y);
            this.ctx.lineTo(this.game.dragEnd.x, this.game.dragEnd.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        this.renderUI();
    }
    
    renderGround() {
        const groundHeight = 40;
        // Use a fixed ground position that doesn't change with canvas resize
        const groundY = this.game.initialHeight - groundHeight;
        
        this.ctx.fillStyle = '#000000';
        
        // Draw the wavy top edge and extend in all directions
        this.ctx.beginPath();
        this.ctx.moveTo(-1000, groundY); // Start way to the left
        
        for (let x = -1000; x <= this.game.width + 1000; x += 3) {
            const wave = Math.sin(x * 0.01) * 6 + Math.sin(x * 0.03) * 3;
            const y = groundY + wave;
            this.ctx.lineTo(x, y);
        }
        
        // Extend the ground way down and to the sides to fill the entire area
        // Use a large fixed height to ensure it always covers the bottom
        this.ctx.lineTo(this.game.width + 1000, groundY + 1000); // Bottom right
        this.ctx.lineTo(-1000, groundY + 1000); // Bottom left
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    renderTrunk() {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 35;
        this.ctx.lineCap = 'square';
        this.ctx.lineJoin = 'miter';
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.game.tree.x, this.game.tree.y);
        
        const controlX = this.game.tree.x + 5;
        const controlY = this.game.tree.y - this.game.tree.trunkHeight * 0.5;
        const endX = this.game.tree.x;
        const endY = this.game.tree.y - this.game.tree.trunkHeight;
        
        this.ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        this.ctx.stroke();
    }
    
    renderBranches() {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineCap = 'square';
        this.ctx.lineJoin = 'miter';
        
        this.game.tree.branches.forEach((branch, index) => {
            this.ctx.lineWidth = branch.thickness || 3;
            
            this.ctx.beginPath();
            this.ctx.moveTo(branch.start.x, branch.start.y);
            
            const dx = branch.end.x - branch.start.x;
            const dy = branch.end.y - branch.start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            const seed1 = (branch.start.x + branch.start.y + index) * 0.1;
            const seed2 = (branch.end.x + branch.end.y + index) * 0.15;
            
            const curveIntensity = length * 0.25;
            const curveAngle1 = angle + Math.sin(seed1) * 0.3;
            const curveAngle2 = angle + Math.sin(seed2) * 0.4;
            
            const control1X = branch.start.x + Math.cos(curveAngle1) * curveIntensity * 0.6;
            const control1Y = branch.start.y + Math.sin(curveAngle1) * curveIntensity * 0.6;
            
            const control2X = branch.start.x + dx * 0.6 + Math.cos(curveAngle2) * curveIntensity * 0.4;
            const control2Y = branch.start.y + dy * 0.6 + Math.sin(curveAngle2) * curveIntensity * 0.4;
            
            this.ctx.bezierCurveTo(control1X, control1Y, control2X, control2Y, branch.end.x, branch.end.y);
            this.ctx.stroke();
        });
    }
    
    renderLeaves() {
        this.game.tree.leaves.forEach(leaf => {
            // Update leaf position based on current branch position (for growing branches)
            if (leaf.branch && leaf.t !== undefined) {
                const leafX = leaf.branch.start.x + (leaf.branch.end.x - leaf.branch.start.x) * leaf.t;
                const leafY = leaf.branch.start.y + (leaf.branch.end.y - leaf.branch.start.y) * leaf.t;
                
                leaf.x = leafX + leaf.offsetX;
                leaf.y = leafY + leaf.offsetY;
            }
            
            const swayX = Math.sin(Date.now() * 0.002 + leaf.sway) * 1;
            const swayY = Math.cos(Date.now() * 0.0015 + leaf.sway) * 0.5;

            const targetSize = leaf.size || leaf.targetSize || 10;
            const growthProgress = Math.min((leaf.growthProgress ?? (targetSize ? 1 : 0)) + 0.02, 1);
            leaf.growthProgress = growthProgress;
            const renderSize = targetSize * Math.max(growthProgress, 0.1);
            
            this.ctx.save();
            this.ctx.translate(leaf.x + swayX, leaf.y + swayY);
            this.ctx.rotate(leaf.angle + Math.sin(Date.now() * 0.003 + leaf.sway) * 0.1);
            
            this.ctx.fillStyle = '#4a6741'; // Muted olive green - more subtle
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, renderSize, renderSize * 0.6, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#2d3e2d'; // Darker olive for border
            this.ctx.lineWidth = 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -renderSize * 0.6);
            this.ctx.lineTo(0, renderSize * 0.6);
            this.ctx.stroke();
            
            this.ctx.restore();
        });
    }
    
    renderFruits() {
        this.game.tree.fruits.forEach(fruit => {
            // Update fruit position if branch moved
            if (fruit.branch) {
                fruit.x = fruit.branch.end.x;
                fruit.y = fruit.branch.end.y;
            }
            
            const swayX = Math.sin(Date.now() * 0.001 + fruit.sway) * 2;
            const swayY = Math.cos(Date.now() * 0.0015 + fruit.sway) * 1;

            const targetSize = fruit.size || fruit.targetSize || 30;
            const growthProgress = Math.min((fruit.growthProgress ?? (targetSize ? 1 : 0)) + 0.02, 1);
            fruit.growthProgress = growthProgress;
            const renderSize = targetSize * Math.max(growthProgress, 0.2);
            
            this.ctx.save();
            this.ctx.translate(fruit.x + swayX, fruit.y + swayY);
            
            // Draw fruit with emoji
            this.ctx.font = `${renderSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(fruit.type, 0, 0);
            
            this.ctx.restore();
        });
    }

    renderFallingFruits() {
        if (!this.game.fallingFruits || this.game.fallingFruits.length === 0) {
            return;
        }

        const groundHeight = 40;
        const groundY = (this.game.initialHeight || this.game.height) - groundHeight;
        const remaining = [];

        this.game.fallingFruits.forEach(fruit => {
            fruit.vy = (fruit.vy ?? 0) + (fruit.gravity ?? 0.2);
            fruit.vx = fruit.vx ?? 0;
            fruit.x += fruit.vx;
            fruit.y += fruit.vy;
            fruit.rotation = (fruit.rotation || 0) + (fruit.spinSpeed || 0);

            if (fruit.y >= groundY - 5) {
                fruit.y = groundY - 5;
                if (Math.abs(fruit.vy) > 0.6 && (fruit.bounceCount || 0) < 2) {
                    fruit.vy *= -0.35;
                    fruit.vx *= 0.85;
                    fruit.bounceCount = (fruit.bounceCount || 0) + 1;
                } else {
                    fruit.vy = 0;
                    fruit.vx *= 0.8;
                    fruit.landed = true;
                }
            }

            if (fruit.landed) {
                fruit.fade = (fruit.fade || 0) + 0.02;
            }

            const opacity = 1 - (fruit.fade || 0);
            if (opacity <= 0) {
                return;
            }

            this.ctx.save();
            this.ctx.translate(fruit.x, fruit.y);
            if (fruit.rotation) {
                this.ctx.rotate(fruit.rotation);
            }
            this.ctx.globalAlpha = opacity;
            this.ctx.font = `${fruit.size}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(fruit.type, 0, 0);
            this.ctx.restore();

            remaining.push(fruit);
        });

        this.game.fallingFruits = remaining;
        this.ctx.globalAlpha = 1;
    }
    
    renderFlowers() {
        this.game.tree.flowers.forEach(flower => {
            // Update flower position if branch moved
            if (flower.branch) {
                flower.x = flower.branch.end.x;
                flower.y = flower.branch.end.y;
            }
            
            const swayX = Math.sin(Date.now() * 0.0008 + flower.sway) * 3;
            const swayY = Math.cos(Date.now() * 0.0012 + flower.sway) * 2;
            
            this.ctx.save();
            this.ctx.translate(flower.x + swayX, flower.y + swayY);
            
            // Draw flower with emoji
            this.ctx.font = `${flower.size}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(flower.type, 0, 0);
            
            this.ctx.restore();
        });
    }
    
    renderLightSource() {
        if (this.game.isNightMode) {
            // Render moon
            this.ctx.shadowColor = 'rgba(200, 200, 255, 0.6)';
            this.ctx.shadowBlur = 25;
            this.ctx.fillStyle = '#E6E6FA'; // Light purple/white
            this.ctx.beginPath();
            this.ctx.arc(this.game.lightSource.x, this.game.lightSource.y, this.game.lightSource.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        } else {
            // Render sun
            this.ctx.shadowColor = 'rgba(255, 255, 0, 0.8)';
            this.ctx.shadowBlur = 30;
            this.ctx.fillStyle = '#FFD700';
            this.ctx.beginPath();
            this.ctx.arc(this.game.lightSource.x, this.game.lightSource.y, this.game.lightSource.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }
    
    renderHoveredNode() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(this.game.hoveredNode.x, this.game.hoveredNode.y, 8, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    renderHighlightedNode() {
        const node = this.game.highlightedNode;
        const timeSinceHighlight = Date.now() - this.game.highlightStartTime;
        const pulseDuration = 3000; // 3 seconds
        const pulseProgress = (timeSinceHighlight % 1000) / 1000; // 1 second pulse cycle
        
        // Create pulsing effect with golden color
        const alpha = 0.7 + 0.3 * Math.sin(pulseProgress * Math.PI * 2);
        const radius = 12 + 4 * Math.sin(pulseProgress * Math.PI * 2);
        
        // Outer glow
        this.ctx.shadowColor = '#FFD700';
        this.ctx.shadowBlur = 20;
        this.ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(node.end.x, node.end.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Inner core
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(node.end.x, node.end.y, 6, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    renderTooltip(searchResult, x, y) {
        const tooltipWidth = 300;
        const tooltipHeight = 120;
        const padding = 15;
        const borderRadius = 8;
        
        // Position tooltip to avoid going off screen
        let tooltipX = x + 15;
        let tooltipY = y - tooltipHeight - 15;
        
        // Adjust if tooltip would go off screen
        if (tooltipX + tooltipWidth > this.game.width) {
            tooltipX = x - tooltipWidth - 15;
        }
        if (tooltipY < 0) {
            tooltipY = y + 15;
        }
        
        // Draw tooltip background with rounded corners
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
        // Draw rounded rectangle
        this.ctx.beginPath();
        this.ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, borderRadius);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw header background
        this.ctx.fillStyle = '#222';
        this.ctx.beginPath();
        this.ctx.roundRect(tooltipX, tooltipY, tooltipWidth, 40, [borderRadius, borderRadius, 0, 0]);
        this.ctx.fill();
        
        // Draw header border
        this.ctx.strokeStyle = '#333';
        this.ctx.beginPath();
        this.ctx.moveTo(tooltipX, tooltipY + 40);
        this.ctx.lineTo(tooltipX + tooltipWidth, tooltipY + 40);
        this.ctx.stroke();
        
        // Draw title (proper case) with line wrapping and truncation
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px "JetBrains Mono", monospace';
        const title = this.toProperCase(searchResult.title);
        const maxTitleWidth = tooltipWidth - (padding * 2);
        
        // Check if title fits on one line
        const titleWidth = this.ctx.measureText(title).width;
        let titleUsedTwoLines = false;
        
        if (titleWidth <= maxTitleWidth) {
            // Title fits on one line
            this.ctx.fillText(title, tooltipX + padding, tooltipY + 25);
        } else {
            // Try to fit on two lines
            const words = title.split(' ');
            const midPoint = Math.ceil(words.length / 2);
            const firstLine = words.slice(0, midPoint).join(' ');
            const secondLine = words.slice(midPoint).join(' ');
            
            const firstLineWidth = this.ctx.measureText(firstLine).width;
            const secondLineWidth = this.ctx.measureText(secondLine).width;
            
            if (firstLineWidth <= maxTitleWidth && secondLineWidth <= maxTitleWidth) {
                // Both lines fit
                this.ctx.fillText(firstLine, tooltipX + padding, tooltipY + 20);
                this.ctx.fillText(secondLine, tooltipX + padding, tooltipY + 35);
                titleUsedTwoLines = true;
            } else {
                // Truncate with ellipses
                const truncatedTitle = this.truncateText(title, maxTitleWidth);
                this.ctx.fillText(truncatedTitle, tooltipX + padding, tooltipY + 25);
            }
        }
        
        // Draw description (proper case)
        this.ctx.fillStyle = '#ccc';
        this.ctx.font = '12px "JetBrains Mono", monospace';
        const description = this.toProperCase(searchResult.snippet || searchResult.llm_content || 'No description available');
        
        // Wrap text to fit in tooltip
        const maxWidth = tooltipWidth - (padding * 2);
        const lines = this.wrapText(description, maxWidth);
        
        // Adjust description position based on title length
        let lineY = tooltipY + (titleUsedTwoLines ? 70 : 60);
        
        lines.slice(0, 3).forEach(line => { // Show max 3 lines
            this.ctx.fillText(line, tooltipX + padding, lineY);
            lineY += 15;
        });
        
        // Draw click instruction based on current tool
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.font = '11px "JetBrains Mono", monospace';
        if (this.game.currentTool === 'study') {
            this.ctx.fillText('Click to expand', tooltipX + padding, tooltipY + tooltipHeight - 8);
        } else {
            this.ctx.fillText('Use study tool to expand', tooltipX + padding, tooltipY + tooltipHeight - 8);
        }
    }
    
    toProperCase(str) {
        if (!str) {
            return '';
        }

        return str
            .split('\n')
            .map(line => this.formatLineForDisplay(line))
            .join('\n');
    }

    formatLineForDisplay(line) {
        if (!line || !line.trim()) {
            return '';
        }

        const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
        const prefix = bulletMatch ? bulletMatch[1] : '';
        const content = bulletMatch ? bulletMatch[2] : line.trim();

        let expanded = content
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/([0-9])([A-Za-z])/g, '$1 $2')
            .replace(/([A-Za-z])([0-9])/g, '$1 $2')
            .replace(/([A-Za-z0-9])[_\-]+([A-Za-z0-9])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();

        if (!expanded) {
            return prefix;
        }

        if (!/[A-Z]/.test(expanded)) {
            expanded = expanded.replace(/\b[a-z]/g, letter => letter.toUpperCase());
        } else {
            expanded = expanded.replace(/^[a-z]/, letter => letter.toUpperCase());
        }

        expanded = expanded.replace(/([.!?]\s+)([a-z])/g, (_, punctuation, letter) => {
            return punctuation + letter.toUpperCase();
        });

        return prefix + expanded;
    }
    
    wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];
        
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = this.ctx.measureText(currentLine + ' ' + word).width;
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }
    
    truncateText(text, maxWidth) {
        const ellipses = '...';
        const ellipsesWidth = this.ctx.measureText(ellipses).width;
        
        if (this.ctx.measureText(text).width <= maxWidth) {
            return text;
        }
        
        let truncated = text;
        while (this.ctx.measureText(truncated + ellipses).width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
        }
        
        return truncated + ellipses;
    }
    
    renderUI() {
        // Keep text color consistent - it's rendered over the black soil
        this.ctx.fillStyle = '#ecf0f1'; // Light text that shows well over dark soil
        this.ctx.font = '12px "JetBrains Mono", "Source Code Pro", "Fira Code", "Courier New", monospace';
        
        // Position text at top left with same padding as buttons
        const textX = 20; // Same left padding as control buttons
        const textY = 20; // Back to top position
        
        if (this.game.currentTool === 'pan') {
            this.ctx.fillText('pan tool: drag to move around the view', textX, textY);
        } else if (this.game.currentTool === 'growth') {
            this.ctx.fillText('growth tool: hover over nodes to see info, click to grow branches', textX, textY);
        } else if (this.game.currentTool === 'leaves') {
            this.ctx.fillText('flashcard tool: hover over nodes and click to create flashcards', textX, textY);
        } else if (this.game.currentTool === 'fruit') {
            this.ctx.fillText('bear fruit of labour: hover over flowers and click to transform them into apples', textX, textY);
        } else if (this.game.currentTool === 'flower') {
            this.ctx.fillText('blossom your knowledge: hover over branch ends and click to add flowers', textX, textY);
        } else if (this.game.currentTool === 'reposition') {
            this.ctx.fillText('reposition tool: drag branch ends to move and resize them', textX, textY);
        } else if (this.game.currentTool === 'study') {
            this.ctx.fillText('study tool: hover over nodes to see search results', textX, textY);
        } else {
            this.ctx.fillText('cut tool: click and drag to prune branches', textX, textY);
        }
        
        this.ctx.fillText(`branches: ${this.game.tree.branches.length} | leaves: ${this.game.tree.leaves.length} | fruits: ${this.game.tree.fruits.length} | flowers: ${this.game.tree.flowers.length}`, 10, this.game.height - 10);
    }
}
