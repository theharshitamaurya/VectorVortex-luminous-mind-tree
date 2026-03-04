window.ToolManager = class ToolManager {
    constructor(game) {
        this.game = game;
    }

    setTool(tool) {
        this.game.currentTool = tool;

        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        this.game.canvas.style.cursor = 'default';

        const buttonMap = {
            growth: 'growthTool',
            cut: 'cutTool',
            leaves: 'leavesTool',
            fruit: 'fruitTool',
            harvest: 'harvestTool',
            flower: 'flowerTool',
            reposition: 'repositionTool',
            pan: 'panTool',
            study: 'studyTool'
        };

        const buttonId = buttonMap[tool];
        if (buttonId) {
            const btn = document.getElementById(buttonId);
            btn?.classList.add('active');
        }

        if (tool === 'pan') {
            this.game.canvas.style.cursor = 'grab';
        } else if (tool === 'study') {
            this.game.canvas.style.cursor = 'pointer';
        }

        console.log('Tool set to:', tool);
    }
};
