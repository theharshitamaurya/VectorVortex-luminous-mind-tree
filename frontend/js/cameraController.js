window.CameraController = class CameraController {
    constructor(game) {
        this.game = game;
    }

    resizeCanvas() {
        const headerHeight = 60;
        const oldWidth = this.game.width || 0;
        const oldHeight = this.game.height || 0;

        this.game.width = window.innerWidth;
        this.game.height = window.innerHeight - headerHeight;

        if (!this.game.initialHeight) {
            this.game.initialHeight = this.game.height;
        }

        this.game.canvas.width = this.game.width;
        this.game.canvas.height = this.game.height;

        if (this.game.tree) {
            this.game.tree.oldX = this.game.tree.x || 0;
            this.game.tree.oldY = this.game.tree.y || 0;

            this.game.tree.x = this.game.width / 2;
            this.game.tree.y = this.game.initialHeight - 40;

            if ((this.game.tree.oldX !== 0 || this.game.tree.oldY !== 0) && oldWidth && oldHeight) {
                this.game.treeManager.repositionTreeAssets();
            }
        }

        if (this.game.lightSource) {
            this.game.lightSource.x = this.game.width / 2;
        }
    }

    startPan(mousePos) {
        this.game.isPanning = true;
        this.game.panStart = { ...mousePos };
        this.game.canvas.style.cursor = 'grabbing';
    }

    pan(mousePos) {
        if (!this.game.isPanning || !this.game.panStart) {
            return;
        }

        const deltaX = mousePos.x - this.game.panStart.x;
        const deltaY = mousePos.y - this.game.panStart.y;

        this.game.cameraOffset.x += deltaX;
        this.game.cameraOffset.y += deltaY;

        const maxPanUp = this.game.initialHeight ? this.game.initialHeight - 40 : 0;
        if (this.game.cameraOffset.y > maxPanUp) {
            this.game.cameraOffset.y = maxPanUp;
        }

        this.game.panStart = { ...mousePos };
    }

    endPan() {
        this.game.isPanning = false;
        this.game.panStart = null;
        this.game.canvas.style.cursor = this.game.currentTool === 'pan' ? 'grab' : 'default';
    }
};
