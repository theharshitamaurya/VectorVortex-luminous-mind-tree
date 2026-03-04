const API_BASE_URL = (() => {
    const origin = window.location.origin || "";
    const isLocalHost = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin);
    if (!origin || origin === "null" || origin.startsWith("file:")) {
        return "http://localhost:3000";
    }
    return isLocalHost ? "" : "";
})();

class UltraSimplePrune {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.gameState = 'initialized';
        this.currentTool = 'growth';

        this.mousePos = { x: 0, y: 0 };
        this.isDragging = false;
        this.dragStart = null;
        this.dragEnd = null;
        this.isRepositioning = false;
        this.repositioningNode = null;
        this.isNightMode = false;
        this.hoveredNode = null;

        this.isPanning = false;
        this.panStart = null;
        this.cameraOffset = { x: 0, y: 0 };

        this.tree = null;
        this.lightSource = null;
        this.fallingFruits = [];

        this.lastTime = 0;
        this.branchCount = 0;

        this.currentSessionId = null;
        this.isLoadingGame = false;

        this.highlightedNode = null;
        this.highlightStartTime = null;
        this.highlightTimeout = null;

        this.ui = new UIManager(this);
        this.treeManager = new TreeManager(this);
        this.cameraController = new CameraController(this);
        this.toolManager = new ToolManager(this);
        this.learningFeature = new LearningFeature(this);
        this.interactionManager = new InteractionManager(this);

        this.flashcardManager = new FlashcardManager(this, API_BASE_URL);
        this.quizManager = new QuizManager(this, this.flashcardManager, API_BASE_URL);
        this.searchManager = new SearchManager(this, API_BASE_URL);
        this.welcomeManager = new WelcomeManager(this, this.searchManager);

        this.init();
    }

    init() {
        console.log('Initializing game...');

        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        this.setupGameObjects();
        this.setupEventListeners();
        this.startGame();

        this.gameLoop();
    }

    resizeCanvas() {
        this.cameraController.resizeCanvas();
    }

    setupGameObjects() {
        this.treeManager.initializeTree();
    }

    setupEventListeners() {
        this.interactionManager.setupEventListeners();
    }

    startGame() {
        console.log('Starting game...');
        this.gameState = 'playing';

        if (this.tree.branches.length === 0 && !this.isLoadingGame) {
            this.welcomeManager.startSequence();
        }

        this.loadLeavesFromSavedData();
    }

    loadLeavesFromSavedData() {
        this.treeManager.loadLeavesFromSavedData();
    }

    setTool(tool) {
        this.toolManager.setTool(tool);
    }

    updateStatus(message) {
        this.ui.updateStatus(message);
    }

    gameLoop() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.update(deltaTime);

        if (this.renderer) {
            this.renderer.render();
        } else {
            this.render();
        }

        requestAnimationFrame(() => this.gameLoop());
    }

    update(deltaTime) {
        this.treeManager.update(deltaTime);
    }

    getNodeAtPosition(pos) {
        return this.treeManager.getNodeAtPosition(pos);
    }

    growBranchesFromNode(node) {
        this.treeManager.growBranchesFromNode(node);
    }

    transformFlowerToFruit(node) {
        this.treeManager.transformFlowerToFruit(node);
    }

    async harvestFruit(node) {
        await this.learningFeature.harvestFruit(node);
    }

    async createQuizFromFlashcards() {
        return this.learningFeature.createQuizFromFlashcards();
    }

    getRandomFlashcards(count) {
        return this.learningFeature.getRandomFlashcards(count);
    }

    async generateMultipleChoiceQuestions(flashcards) {
        return this.learningFeature.generateMultipleChoiceQuestions(flashcards);
    }

    generateSimpleQuestions(flashcards) {
        return this.learningFeature.generateSimpleQuestions(flashcards);
    }

    showQuizModal(questions) {
        return this.learningFeature.showQuizModal(questions);
    }

    growFlowerOnNode(node) {
        this.treeManager.growFlowerOnNode(node);
    }

    showStudyModal(searchResult) {
        this.ui.showStudyModal(searchResult);
    }

    showFlashcardsForTopic(topic) {
        if (!this.flashcardManager) {
            return;
        }
        this.hideStudyModal();
        this.flashcardManager.showFlashcardsForTopic(topic);
    }

    formatContent(text) {
        return this.ui.formatContent(text);
    }

    toggleDayNight() {
        this.ui.toggleDayNight();
    }

    addLeavesToNode(node, count) {
        this.treeManager.addLeavesToNode(node, count);
    }

    updateFlashcardDeck() {
        if (this.flashcardManager) {
            this.flashcardManager.updateFlashcardDeck();
        }
    }

    findParentMainTopicBranch(childBranch) {
        if (this.flashcardManager) {
            return this.flashcardManager.findParentMainTopicBranch(childBranch);
        }
        return childBranch || null;
    }

    showDeckView() {
        if (this.flashcardManager) {
            this.flashcardManager.showDeckView();
        }
    }

    showDeckFlashcards(topic) {
        if (this.flashcardManager) {
            this.flashcardManager.showDeckFlashcards(topic);
        }
    }

    showFlashcards(flashcards, topic) {
        if (this.flashcardManager) {
            this.flashcardManager.showFlashcards(flashcards, topic);
        }
    }

    highlightNodeAtPosition(nodePosition) {
        if (this.flashcardManager) {
            this.flashcardManager.highlightNodeFromFlashcard(nodePosition);
        }
    }

    closeAllDeckModals() {
        if (this.flashcardManager) {
            this.flashcardManager.closeAllDeckModals();
        }
    }

    async saveGameState() {
        this.updateStatus('Saving is temporarily disabled while we upgrade storage.');
        console.warn('saveGameState called but feature is disabled');
    }

    async loadGameState(sessionId) {
        try {
            this.isLoadingGame = true;
            this.updateStatus('Loading is temporarily disabled while we upgrade storage.');
            console.warn('loadGameState called but feature is disabled');
        } finally {
            this.isLoadingGame = false;
        }
    }

    async getGameSessions() {
        console.warn('getGameSessions called but feature is disabled');
        return [];
    }

    async deleteGameState(sessionId) {
        console.warn('deleteGameState called but feature is disabled');
        this.updateStatus('Deleting saves is temporarily disabled.');
    }

    hideStudyModal() {
        this.ui.hideStudyModal();
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.tree) {
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 20;
            this.ctx.beginPath();
            this.ctx.moveTo(this.tree.x, this.tree.y);
            this.ctx.lineTo(this.tree.x, this.tree.y - this.tree.trunkHeight);
            this.ctx.stroke();
        }
    }

    triggerFirstGrowth() {
        this.treeManager.triggerFirstGrowth();
    }

    repositionTreeAssets() {
        this.treeManager.repositionTreeAssets();
    }

    restartGame() {
        this.treeManager.resetTree();
        this.currentSessionId = null;
        this.isLoadingGame = false;
        this.gameState = 'welcome';
        this.panY = 0;

        if (this.flashcardManager) {
            this.flashcardManager.reset();
        }
        if (this.quizManager) {
            this.quizManager.reset();
        }
        if (this.searchManager) {
            this.searchManager.reset();
        }
        if (this.welcomeManager) {
            this.welcomeManager.reset();
        }

        this.cameraOffset = { x: 0, y: 0 };
        this.hideStudyModal();

        if (this.flashcardManager) {
            this.flashcardManager.closeAllDeckModals();
        }

        this.fallingFruits = [];

        this.welcomeManager.startSequence();
        this.updateStatus('Game restarted! Enter a topic to begin learning.');
    }
}
