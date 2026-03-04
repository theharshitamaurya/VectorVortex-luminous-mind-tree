window.UIManager = class UIManager {
    constructor(game) {
        this.game = game;
        this.statusElement = document.getElementById('status');
    }

    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
    }

    toggleDayNight() {
        this.game.isNightMode = !this.game.isNightMode;
        const btn = document.getElementById('dayNightBtn');
        const body = document.body;

        if (this.game.isNightMode) {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-sun"></i>';
                btn.title = 'switch to day mode';
                btn.style.background = 'rgba(72, 61, 139, 0.9)';
            }
            body?.classList?.remove('day-mode');
            this.updateStatus('Switched to night mode - moon is out!');
        } else {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-moon"></i>';
                btn.title = 'switch to night mode';
                btn.style.background = 'rgba(232, 213, 196, 0.9)';
            }
            body?.classList?.add('day-mode');
            this.updateStatus('Switched to day mode - sun is shining!');
        }
    }

    formatContent(text) {
        if (!text) {
            return 'No description available';
        }

        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        formatted = formatted.replace(
            urlRegex,
            '<a href="$1" target="_blank" style="color: #3b82f6; text-decoration: underline;">$1</a>'
        );

        let paragraphs = formatted.split(/\n\s*\n/).filter(p => p.trim().length > 0);

        if (paragraphs.length === 1 && formatted.length > 200) {
            paragraphs = formatted.split(/\.\s+(?=[A-Z])/).filter(p => p.trim().length > 0);
        }

        if (paragraphs.length > 1) {
            formatted = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
        } else {
            formatted = `<p>${formatted.trim()}</p>`;
        }

        return formatted;
    }

    showStudyModal(searchResult) {
        const modal = document.getElementById('studyModal');
        const title = document.getElementById('modalTitle');
        const description = document.getElementById('modalDescription');
        const flashcardBtn = document.getElementById('showFlashcardsBtn');
        const readFromSourceBtn = document.getElementById('readFromSourceBtn');

        if (!modal || !title || !description) {
            return;
        }

        title.textContent = searchResult.title;
        const content = searchResult.snippet || searchResult.llm_content || 'No description available';
        description.innerHTML = this.formatContent(content);

        if (flashcardBtn && this.game.flashcardManager) {
            const topicFlashcards = this.game.flashcardManager.getFlashcardsForTopic(searchResult.title);
            if (topicFlashcards.length > 0) {
                flashcardBtn.style.display = 'block';
                flashcardBtn.onclick = () => {
                    this.game.flashcardManager.showFlashcardsForTopic(searchResult.title);
                };
            } else {
                flashcardBtn.style.display = 'none';
            }
        }

        if (readFromSourceBtn) {
            if (searchResult.url) {
                readFromSourceBtn.style.display = 'block';
                readFromSourceBtn.onclick = () => {
                    window.open(searchResult.url, '_blank');
                };
            } else {
                readFromSourceBtn.style.display = 'none';
            }
        }

        modal.classList.add('show');
    }

    hideStudyModal() {
        const modal = document.getElementById('studyModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }
};
