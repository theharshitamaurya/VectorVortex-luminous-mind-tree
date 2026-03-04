window.InteractionManager = class InteractionManager {
    constructor(game) {
        this.game = game;
    }

    setupEventListeners() {
        this.registerToolButtons();
        this.registerCanvasEvents();
        this.registerUIControls();
    }

    registerToolButtons() {
        const mappings = [
            { id: 'growthTool', tool: 'growth' },
            { id: 'cutTool', tool: 'cut' },
            { id: 'leavesTool', tool: 'leaves' },
            { id: 'fruitTool', tool: 'fruit' },
            { id: 'harvestTool', tool: 'harvest' },
            { id: 'flowerTool', tool: 'flower' },
            { id: 'repositionTool', tool: 'reposition' },
            { id: 'panTool', tool: 'pan' },
            { id: 'studyTool', tool: 'study' }
        ];

        mappings.forEach(({ id, tool }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', () => {
                    this.game.setTool(tool);
                });
            }
        });
    }

    registerCanvasEvents() {
        this.game.canvas.addEventListener('mousedown', (e) => {
            void this.handleMouseDown(e);
        });
        this.game.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });
        this.game.canvas.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });
    }

    registerUIControls() {
        const dayNightBtn = document.getElementById('dayNightBtn');
        if (dayNightBtn) {
            dayNightBtn.addEventListener('click', () => {
                this.game.toggleDayNight();
            });
        }

        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.game.restartGame();
            });
        }
    }

    async handleMouseDown(event) {
        if (this.game.gameState !== 'playing') {
            return;
        }

        const mousePos = this.getMousePosition(event);
        this.game.mousePos = mousePos;

        if (this.game.currentTool === 'pan') {
            this.game.cameraController.startPan(mousePos);
            return;
        }

        const hoveredNode = this.game.treeManager.getNodeAtPosition(mousePos);
        this.game.hoveredNode = hoveredNode;

        switch (this.game.currentTool) {
            case 'growth':
                if (hoveredNode) {
                    this.game.treeManager.growBranchesFromNode(hoveredNode);
                }
                break;
            case 'leaves':
                await this.game.learningFeature.handleLeavesTool(hoveredNode);
                break;
            case 'fruit':
                this.game.treeManager.transformFlowerToFruit(hoveredNode);
                break;
            case 'harvest':
                await this.game.learningFeature.harvestFruit(hoveredNode);
                break;
            case 'flower':
                this.game.treeManager.growFlowerOnNode(hoveredNode);
                break;
            case 'reposition':
                if (hoveredNode) {
                    this.game.isRepositioning = true;
                    this.game.repositioningNode = hoveredNode;
                    this.game.updateStatus('Drag to move and resize the branch!');
                } else {
                    this.game.updateStatus('Hover over a branch end first, then drag to reposition!');
                }
                break;
            case 'cut':
                this.game.isDragging = true;
                this.game.dragStart = { ...mousePos };
                break;
            case 'study':
                if (hoveredNode?.searchResult) {
                    this.game.showStudyModal(hoveredNode.searchResult);
                }
                break;
            default:
                break;
        }

        console.log('Mouse down at:', mousePos);
    }

    handleMouseMove(event) {
        const mousePos = this.getMousePosition(event);
        this.game.mousePos = mousePos;

        if (this.game.isPanning) {
            this.game.cameraController.pan(mousePos);
            return;
        }

        const hoverTools = new Set(['growth', 'leaves', 'fruit', 'harvest', 'flower', 'reposition', 'study', 'pan']);
        if (hoverTools.has(this.game.currentTool)) {
            this.game.hoveredNode = this.game.treeManager.getNodeAtPosition(mousePos);
        }

        if (this.game.currentTool === 'cut' && this.game.isDragging) {
            this.game.dragEnd = { ...mousePos };
        }

        if (this.game.isRepositioning && this.game.repositioningNode) {
            this.game.treeManager.repositionNode(this.game.repositioningNode, mousePos);
        }
    }

    handleMouseUp(event) {
        if (this.game.gameState !== 'playing') {
            return;
        }

        const mousePos = this.getMousePosition(event);
        this.game.mousePos = mousePos;

        if (this.game.isDragging) {
            this.game.dragEnd = { ...mousePos };
            this.game.performPruning();
            this.game.isDragging = false;
            this.game.dragStart = null;
            this.game.dragEnd = null;
            console.log('Mouse up - pruning performed');
        }

        if (this.game.isRepositioning) {
            this.game.isRepositioning = false;
            this.game.repositioningNode = null;
            console.log('Mouse up - repositioning finished');
        }

        if (this.game.isPanning) {
            this.game.cameraController.endPan();
        }
    }

    getMousePosition(event) {
        const rect = this.game.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
};
