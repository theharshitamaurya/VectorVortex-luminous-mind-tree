/**
 * Main Application - Initializes and coordinates all game systems
 */
class PruneApp {
  constructor() {
    this.game = null;
    this.renderer = null;
    this.pruningSystem = null;
  }

  init() {
    console.log("Initializing Prune Game App...");

    // Initialize game systems
    this.game = new UltraSimplePrune();
    this.renderer = new Renderer(this.game);
    this.pruningSystem = new PruningSystem(this.game);

    // Override the game's performPruning method to use our pruning system
    this.game.performPruning = () => this.pruningSystem.performPruning();

    // Store reference to renderer in game for game loop
    this.game.renderer = this.renderer;

    // Initialize modal event listeners
    this.initModalListeners();

    // Initialize save/load button listeners
    this.initSaveLoadListeners();

    console.log("Prune Game App initialized successfully!");
  }

  initModalListeners() {
    // Close modal button
    const closeBtn = document.getElementById("closeModal");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this.game.hideStudyModal();
      });
    }

    // Flashcard button - handled dynamically in showStudyModal

    // Close modal when clicking outside
    const modal = document.getElementById("studyModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.game.hideStudyModal();
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.game.hideStudyModal();
      }
    });
  }

  initSaveLoadListeners() {
    // Restart button
    const restartBtn = document.getElementById("restartBtn");
    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        this.restartGame();
      });
    }

    // Save button
    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
      saveBtn.title =
        "Saving is temporarily disabled while we upgrade storage.";
      saveBtn.addEventListener("click", () => {
        this.game.saveGameState();
      });
    }

    // Load button
    const loadBtn = document.getElementById("loadBtn");
    if (loadBtn) {
      loadBtn.title =
        "Loading is temporarily disabled while we upgrade storage.";
      loadBtn.addEventListener("click", async () => {
        await this.showLoadModal();
      });
    }

    // Close load modal button
    const closeLoadBtn = document.getElementById("closeLoadModal");
    if (closeLoadBtn) {
      closeLoadBtn.addEventListener("click", () => {
        this.hideLoadModal();
      });
    }

    // Close load modal when clicking outside
    const loadModal = document.getElementById("loadModal");
    if (loadModal) {
      loadModal.addEventListener("click", (e) => {
        if (e.target === loadModal) {
          this.hideLoadModal();
        }
      });
    }
  }

  async showLoadModal() {
    const modal = document.getElementById("loadModal");
    const sessionsList = document.getElementById("sessionsList");

    if (modal && sessionsList) {
      sessionsList.innerHTML =
        "<p>Saving and loading are temporarily disabled while we upgrade storage.</p>";
      modal.classList.add("show");
    }
  }

  hideLoadModal() {
    const modal = document.getElementById("loadModal");
    if (modal) {
      modal.classList.remove("show");
    }
  }

  async loadSession(sessionId) {
    this.game.updateStatus(
      "Loading is temporarily disabled while we upgrade storage.",
    );
    this.hideLoadModal();
  }

  async deleteSession(sessionId) {
    this.game.updateStatus("Deleting saves is temporarily disabled.");
    this.hideLoadModal();
  }

  showAllFlashcards() {
    if (this.game?.flashcardManager) {
      this.game.flashcardManager.showAllFlashcards();
    }
  }

  showDeckFlashcards(topic) {
    if (this.game?.flashcardManager) {
      this.game.flashcardManager.showDeckFlashcards(topic);
    }
  }

  showDeckView() {
    if (this.game?.flashcardManager) {
      this.game.flashcardManager.showDeckView();
    }
  }

  showQuizDeckView() {
    if (this.game?.quizManager) {
      this.game.quizManager.showQuizDeckView();
    }
  }

  showSavedQuizzes(topic) {
    if (this.game?.quizManager) {
      this.game.quizManager.showDeckQuizzes(topic);
    }
  }

  showAllQuizzes() {
    if (this.game?.quizManager) {
      this.game.quizManager.showAllSavedQuizzes();
    }
  }

  playSavedQuiz(quizId) {
    if (this.game?.quizManager) {
      this.game.quizManager.startSavedQuiz(quizId);
    }
  }

  highlightQuizSource(quizId) {
    if (this.game?.quizManager) {
      this.game.quizManager.highlightQuizSource(quizId);
    }
  }

  highlightFlashcardSource(cardId) {
    if (!this.game?.flashcardManager) {
      return;
    }
    const card = this.game.flashcardManager.flashcards.find(
      (c) => c.id === cardId,
    );
    if (!card) {
      this.game.updateStatus("Flashcard not found.");
      return;
    }
    const branch = card.branch;
    const branchId =
      card.branchId ||
      branch?.id ||
      this.game.treeManager?.assignBranchId(branch);
    const nodePosition =
      card.node_position ||
      (branch?.end ? { x: branch.end.x, y: branch.end.y } : null);
    this.game.highlightNodeAtPosition({ branchId, nodePosition });
  }

  deleteFlashcard(cardId) {
    if (this.game?.flashcardManager) {
      this.game.flashcardManager.deleteFlashcard(cardId);
    }
  }

  deleteQuiz(quizId) {
    if (this.game?.quizManager) {
      this.game.quizManager.deleteQuiz(quizId);
    }
  }

  restartGame() {
    // Reset the game state
    this.game.restartGame();
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing app...");

  window.app = new PruneApp();
  window.app.init();
});
