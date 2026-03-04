window.LearningFeature = class LearningFeature {
    constructor(game) {
        this.game = game;
    }

    async handleLeavesTool(node) {
        if (!node) {
            this.game.updateStatus('Hover over a node first, then click to create flashcards!');
            return;
        }

        await this.game.flashcardManager.createFlashcardsForNode(node);
    }

    async harvestFruit(node) {
        if (!node || !node.isFruit || !node.fruit) {
            this.game.updateStatus('Harvest tool only works on apples! Click on an apple to harvest knowledge.');
            return;
        }

        if (!this.game.flashcardManager.hasFlashcards()) {
            this.game.updateStatus('No flashcards available for quiz! Create some flashcards first.');
            return;
        }

        const targetBranch = node.fruit.branch;
        const branchFlashcards = this.game.flashcardManager.getFlashcardsForBranch(targetBranch);

        if (!branchFlashcards.length) {
            this.game.updateStatus('Create flashcards on this branch before harvesting its fruit!');
            return;
        }

        this.game.treeManager.animateFruitHarvest(node.fruit);

        const prepared = this.game.quizManager.consumePreparedQuiz(targetBranch);
        if (prepared) {
            this.game.quizManager.launchPreparedQuiz(prepared);
            this.game.quizManager.prepareQuizForBranch(targetBranch); // warm next quiz
            return;
        }

        try {
            await this.game.quizManager.startQuizFromFlashcards(targetBranch);
        } finally {
            // Always queue the next quiz so harvesting stays instant after fallback.
            this.game.quizManager.prepareQuizForBranch(targetBranch);
        }
    }

    async createQuizFromFlashcards() {
        return this.game.quizManager.startQuizFromFlashcards();
    }

    getRandomFlashcards(count) {
        return this.game.flashcardManager.getRandomFlashcards(count);
    }

    async generateMultipleChoiceQuestions(flashcards) {
        return this.game.quizManager.generateMultipleChoiceQuestions(flashcards);
    }

    generateSimpleQuestions(flashcards) {
        return this.game.quizManager.generateSimpleQuestions(flashcards);
    }

    showQuizModal(questions) {
        return this.game.quizManager.showQuizModal(questions);
    }
};
