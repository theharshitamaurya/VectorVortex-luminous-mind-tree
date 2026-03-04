/**
 * WelcomeManager controls the onboarding animation and prompt workflow.
 */
class WelcomeManager {
    constructor(game, searchManager) {
        this.game = game;
        this.searchManager = searchManager;
        this.animationFrameId = null;
        this.promptElement = null;
        this.resetState();
    }

    resetState() {
        this.state = {
            isActive: false,
            hasShownPrompt: false,
            originalPanY: 0,
            targetPanY: 0
        };
    }

    startSequence() {
        this.cancelAnimation();
        this.removePrompt();

        this.state.isActive = true;
        this.state.hasShownPrompt = false;
        this.state.originalPanY = this.game.cameraOffset.y;
        this.state.targetPanY = -this.game.height * 0.6;

        this.animateTo(this.state.targetPanY, () => this.showPrompt());
    }

    async handlePromptSubmit(rawInput) {
        const userInput = (rawInput || '').trim() || 'machine learning';
        this.removePrompt();

        this.state.targetPanY = this.state.originalPanY;
        this.animateBackToOrigin();

        const results = await this.searchManager.fetchInitialResults(userInput);
        if (results.length > 0) {
            this.game.triggerFirstGrowth();
        }
    }

    reset() {
        this.cancelAnimation();
        this.removePrompt();
        this.resetState();
    }

    animateTo(targetY, onComplete) {
        if (!this.state.isActive) {
            return;
        }

        const currentY = this.game.cameraOffset.y;
        const diff = targetY - currentY;

        if (Math.abs(diff) > 1) {
            this.game.cameraOffset.y += diff * 0.05;
            this.animationFrameId = requestAnimationFrame(() => this.animateTo(targetY, onComplete));
        } else {
            this.game.cameraOffset.y = targetY;
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }
    }

    animateBackToOrigin() {
        const currentY = this.game.cameraOffset.y;
        const diff = this.state.targetPanY - currentY;

        if (Math.abs(diff) > 1) {
            this.game.cameraOffset.y += diff * 0.05;
            this.animationFrameId = requestAnimationFrame(() => this.animateBackToOrigin());
        } else {
            this.game.cameraOffset.y = this.state.targetPanY;
            this.state.isActive = false;
        }
    }

    showPrompt() {
        if (this.state.hasShownPrompt) {
            return;
        }
        this.state.hasShownPrompt = true;

        const prompt = document.createElement('div');
        prompt.id = 'welcomePrompt';
        prompt.innerHTML = `
            <div class="welcome-prompt-content">
                <h2>Welcome to the root of your knowledge</h2>
                <div class="welcome-prompt-input">
                    <input type="text" id="welcomeInput" placeholder="What would you like to learn?" autofocus>
                    <button id="welcomeSubmit">Enter</button>
                </div>
            </div>
        `;

        const container = this.game.canvas.parentElement;
        container.appendChild(prompt);
        this.promptElement = prompt;

        const input = document.getElementById('welcomeInput');
        const submitBtn = document.getElementById('welcomeSubmit');

        const submitHandler = async () => {
            await this.handlePromptSubmit(input.value);
        };

        input.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                submitHandler();
            }
        });

        submitBtn.addEventListener('click', submitHandler);

        setTimeout(() => input.focus(), 100);
    }

    removePrompt() {
        if (this.promptElement) {
            this.promptElement.remove();
            this.promptElement = null;
        }
    }

    cancelAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}
