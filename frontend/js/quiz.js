/**
 * QuizManager handles transforming flashcards into playable quizzes
 * and manages the saved quiz decks UI.
 */
class QuizManager {
    constructor(game, flashcardManager, apiBaseUrl) {
        this.game = game;
        this.flashcardManager = flashcardManager;
        this.apiBaseUrl = apiBaseUrl;

        this.savedQuizzes = [];
        this.activeQuizContext = null;
        this.preparedQuizzes = new Map();
        this.preparingBranches = new Map();
        this.updateQuizDeckButton();
    }

    async startQuizFromFlashcards(branch = null) {
        if (!this.flashcardManager.hasFlashcards()) {
            this.game.updateStatus('No flashcards available for quiz! Create some flashcards first.');
            return;
        }

        const branchFlashcards = branch
            ? this.flashcardManager.getFlashcardsForBranch(branch)
            : [...this.flashcardManager.flashcards];

        if (branch && branchFlashcards.length === 0) {
            this.game.updateStatus('Create flashcards on this branch before harvesting its fruit!');
            return;
        }

        try {
            this.game.updateStatus('Generating quiz...');
            const quizFlashcards = this.flashcardManager.getRandomFlashcards(5, branchFlashcards);

            if (quizFlashcards.length === 0) {
                this.game.updateStatus('Not enough flashcards available for quiz!');
                return;
            }

            const questions = await this.generateMultipleChoiceQuestions(quizFlashcards);
            const quizEntry = this.saveQuiz(questions, branch, branchFlashcards);
            this.activeQuizContext = quizEntry ? { quizId: quizEntry.id } : null;
            this.showQuizModal(questions);
            this.game.updateStatus('Quiz ready!');
        } catch (error) {
            console.error('Error creating quiz:', error);
            this.game.updateStatus('Error creating quiz. Please try again.');
        }
    }

    async generateMultipleChoiceQuestions(flashcards) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/generate-quiz`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ flashcards })
            });

            if (!response.ok) {
                throw new Error('Failed to generate quiz');
            }

            const data = await response.json();
            return data.questions || [];
        } catch (error) {
            console.error('Error generating AI quiz:', error);
            return this.generateSimpleQuestions(flashcards);
        }
    }

    generateSimpleQuestions(flashcards) {
        const questions = [];

        flashcards.forEach(flashcard => {
            const baseQuestion = {
                question: flashcard.front,
                correctAnswer: flashcard.back,
                options: [flashcard.back]
            };

            const otherFlashcards = flashcards.filter(card => card !== flashcard);
            const shuffled = [...otherFlashcards].sort(() => Math.random() - 0.5);

            shuffled.slice(0, 3).forEach(card => {
                baseQuestion.options.push(card.back);
            });

            const deduped = [...new Set(baseQuestion.options)];
            baseQuestion.options = deduped.slice(0, 4).sort(() => Math.random() - 0.5);

            questions.push(baseQuestion);
        });

        return questions;
    }

    showQuizModal(questions) {
        const modal = document.getElementById('quizModal');
        const questionElement = document.getElementById('quizQuestion');
        const optionsElement = document.getElementById('quizOptions');
        const resultElement = document.getElementById('quizResult');
        const scoreElement = document.getElementById('quizScore');

        if (!modal || !questionElement || !optionsElement || !resultElement || !scoreElement) {
            console.warn('Quiz modal elements missing');
            return;
        }

        resultElement.style.display = 'none';
        scoreElement.style.display = 'none';

        let currentIndex = 0;
        let score = 0;
        let selectedAnswer = null;

        const showQuestion = () => {
            if (currentIndex >= questions.length) {
                showScore();
                return;
            }

            const currentQuestion = questions[currentIndex];
            questionElement.textContent = `Question ${currentIndex + 1}: ${currentQuestion.question}`;

            optionsElement.innerHTML = '';
            currentQuestion.options.forEach(option => {
                const optionElement = document.createElement('div');
                optionElement.className = 'quiz-option';
                optionElement.textContent = option;
                optionElement.addEventListener('click', () => selectAnswer(option, optionElement));
                optionsElement.appendChild(optionElement);
            });
        };

        const selectAnswer = (answer, element) => {
            optionsElement.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
            element.classList.add('selected');
            selectedAnswer = answer;

            setTimeout(showResult, 500);
        };

        const showResult = () => {
            const currentQuestion = questions[currentIndex];
            const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

            if (isCorrect) {
                score++;
            }

            optionsElement.querySelectorAll('.quiz-option').forEach(opt => {
                if (opt.textContent === currentQuestion.correctAnswer) {
                    opt.classList.add('correct');
                } else if (opt.textContent === selectedAnswer && !isCorrect) {
                    opt.classList.add('incorrect');
                }
            });

            resultElement.textContent = isCorrect
                ? 'Correct! 🎉'
                : `Incorrect. The correct answer is: ${currentQuestion.correctAnswer}`;
            resultElement.className = `quiz-result ${isCorrect ? 'correct' : 'incorrect'}`;
            resultElement.style.display = 'block';

            setTimeout(() => {
                currentIndex++;
                showQuestion();
            }, 2000);
        };

        const showScore = () => {
            questionElement.textContent = 'Quiz Complete!';
            optionsElement.innerHTML = '';
            resultElement.style.display = 'none';

            const percentage = Math.round((score / questions.length) * 100);
            scoreElement.innerHTML = `
                <div>Your Score: ${score}/${questions.length}</div>
                <div>Percentage: ${percentage}%</div>
                <div>${percentage >= 80 ? 'Excellent! 🌟' : percentage >= 60 ? 'Good job! 👍' : 'Keep studying! 📚'}</div>
            `;
            scoreElement.style.display = 'block';
            this.persistQuizScore(score, questions.length, percentage);
            this.activeQuizContext = null;
        };

        showQuestion();
        modal.style.display = 'flex';

        const closeButton = document.getElementById('closeQuizModal');
        if (closeButton) {
            closeButton.onclick = () => {
                modal.style.display = 'none';
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    async prepareQuizForBranch(branch) {
        if (!branch || !this.flashcardManager) {
            return null;
        }

        const branchId = branch.id || this.flashcardManager.game.treeManager?.assignBranchId?.(branch);
        if (!branchId) {
            return null;
        }

        if (this.preparedQuizzes.has(branchId)) {
            return this.preparedQuizzes.get(branchId);
        }

        if (this.preparingBranches.has(branchId)) {
            try {
                return await this.preparingBranches.get(branchId);
            } catch (error) {
                console.error('Error awaiting quiz preparation:', error);
                return null;
            }
        }

        const branchFlashcards = this.flashcardManager.getFlashcardsForBranch(branch);
        if (!branchFlashcards.length) {
            return null;
        }

        const seedFlashcards = this.flashcardManager.getRandomFlashcards(5, branchFlashcards);
        if (!seedFlashcards.length) {
            return null;
        }

        const prepPromise = (async () => {
            try {
                const questions = await this.generateMultipleChoiceQuestions(seedFlashcards);
                if (!questions?.length) {
                    return null;
                }
                const preparedPayload = {
                    branch,
                    flashcardsUsed: seedFlashcards,
                    questions: JSON.parse(JSON.stringify(questions))
                };
                this.preparedQuizzes.set(branchId, preparedPayload);
                return preparedPayload;
            } catch (error) {
                console.error('Error preparing quiz for branch:', error);
                return null;
            } finally {
                this.preparingBranches.delete(branchId);
            }
        })();

        this.preparingBranches.set(branchId, prepPromise);
        return prepPromise;
    }

    consumePreparedQuiz(branch) {
        if (!branch) {
            return null;
        }
        const branchId = branch.id || this.flashcardManager.game.treeManager?.assignBranchId?.(branch);
        if (!branchId) {
            return null;
        }
        const prepared = this.preparedQuizzes.get(branchId);
        if (prepared) {
            this.preparedQuizzes.delete(branchId);
            return prepared;
        }
        return null;
    }

    launchPreparedQuiz(prepared) {
        if (!prepared?.questions?.length) {
            return;
        }
        const quizEntry = this.saveQuiz(prepared.questions, prepared.branch, prepared.flashcardsUsed);
        this.activeQuizContext = quizEntry ? { quizId: quizEntry.id } : null;
        this.showQuizModal(prepared.questions);
        this.game.updateStatus('Quiz ready!');
    }

    persistQuizScore(score, totalQuestions, percentage) {
        if (!this.activeQuizContext?.quizId) {
            return;
        }
        const quiz = this.savedQuizzes.find(q => q.id === this.activeQuizContext.quizId);
        if (!quiz) {
            return;
        }
        quiz.lastScore = {
            correct: score,
            total: totalQuestions,
            percentage,
            recordedAt: new Date()
        };
        this.updateQuizDeckButton();
    }

    saveQuiz(questions, branch, flashcardsUsed = []) {
        if (!questions?.length) {
            return null;
        }

        const deckKey = this.getDeckKeyForBranch(branch, flashcardsUsed);
        const branchId = branch?.id || (this.flashcardManager?.game?.treeManager?.assignBranchId
            ? this.flashcardManager.game.treeManager.assignBranchId(branch)
            : null);
        const nodePosition = branch?.end
            ? { x: branch.end.x, y: branch.end.y }
            : (flashcardsUsed[0]?.node_position || null);

        const quizEntry = {
            id: `quiz_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            deckKey,
            createdAt: new Date(),
            questionCount: questions.length,
            branch: branch || null,
            branchId,
            nodePosition,
            lastScore: null,
            questions: JSON.parse(JSON.stringify(questions))
        };

        this.savedQuizzes.push(quizEntry);
        this.updateQuizDeckButton();
        return quizEntry;
    }

    getDeckKeyForBranch(branch, flashcardsUsed = []) {
        if (branch?.searchResult?.title) {
            return branch.searchResult.title;
        }

        if (branch) {
            const parent = this.game.findParentMainTopicBranch(branch);
            if (parent?.searchResult?.title) {
                return parent.searchResult.title;
            }
        }

        if (flashcardsUsed.length > 0 && this.flashcardManager?.getDeckKey) {
            return this.flashcardManager.getDeckKey(flashcardsUsed[0]);
        }

        return 'General';
    }

    updateQuizDeckButton() {
        let deckElement = document.getElementById('quiz-deck');
        if (!deckElement) {
            deckElement = document.createElement('div');
            deckElement.id = 'quiz-deck';
            deckElement.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 20px;
                z-index: 101;
                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                text-transform: none;
            `;
            document.body.appendChild(deckElement);
        }

        if (!this.savedQuizzes.length) {
            deckElement.innerHTML = '';
            deckElement.style.display = 'none';
            return;
        }

        const grouped = this.groupQuizzes();
        const totalDecks = grouped.size;
        const totalQuizzes = this.savedQuizzes.length;

        deckElement.style.display = 'block';
        deckElement.innerHTML = `
            <button onclick="app.showQuizDeckView()" style="
                background: rgba(15, 23, 42, 0.9);
                border: 1px solid rgba(99, 102, 241, 0.6);
                border-radius: 8px;
                padding: 10px 16px;
                color: #f8fafc;
                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.3px;
                cursor: pointer;
                box-shadow: 0 6px 18px rgba(15, 23, 42, 0.35);
                transition: background 0.2s, filter 0.2s;
            " onmouseover="this.style.background='rgba(30, 41, 59, 0.95)'; this.style.filter='brightness(1.05)';"
              onmouseout="this.style.background='rgba(15, 23, 42, 0.9)'; this.style.filter='none';">
                🧠 Quiz Decks (${totalDecks} decks, ${totalQuizzes} quizzes)
            </button>
        `;
    }

    groupQuizzes() {
        const grouped = new Map();
        this.savedQuizzes.forEach(quiz => {
            if (!grouped.has(quiz.deckKey)) {
                grouped.set(quiz.deckKey, []);
            }
            grouped.get(quiz.deckKey).push(quiz);
        });
        return grouped;
    }

    showQuizDeckView() {
        if (!this.savedQuizzes.length) {
            this.game.updateStatus('No saved quizzes yet. Harvest knowledge to create some!');
            return;
        }

        this.closeAllQuizModals();
        const grouped = this.groupQuizzes();

        const modal = document.createElement('div');
        modal.className = 'quiz-deck-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #101827;
            border: 1px solid #2f3542;
            border-radius: 10px;
            padding: 20px;
            min-width: 480px;
            max-height: 75vh;
            overflow-y: auto;
            z-index: 1000;
            color: #e2e8f0;
            font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
            text-transform: none;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.5);
        `;

        let deckHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 15px 0; color: #f8fafc; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">🧠 Quiz Decks</h3>
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(67,56,202,0.18); border-radius: 6px; font-weight: 600; color: #cbd5f5;">
                    <div>Deck</div>
                    <div>Quizzes</div>
                </div>
        `;

        const toProperCase = (text) => {
            if (this.flashcardManager?.toProperCase) {
                return this.flashcardManager.toProperCase(text);
            }
            if (!text) return 'General';
            return text.replace(/\b[a-z]/g, letter => letter.toUpperCase());
        };

        [...grouped.entries()].forEach(([topic, quizzes]) => {
            const displayTopic = toProperCase(topic);
            const escapedTopic = topic.replace(/'/g, "\\'");
            deckHTML += `
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 10px 8px; border-radius: 6px; cursor: pointer; transition: background 0.2s;"
                     onmouseover="this.style.background='rgba(67,56,202,0.22)'"
                     onmouseout="this.style.background='transparent'"
                     onclick="app.showSavedQuizzes('${escapedTopic}')">
                    <div style="color: #f8fafc; font-weight: 500;">${displayTopic}</div>
                    <div style="color: #cbd5f5; font-weight: 600; text-align: right;">${quizzes.length}</div>
                </div>
            `;
        });

        deckHTML += `
            </div>
            <div style="text-align: center; margin-top: 10px;">
                <button onclick="app.showAllQuizzes()" style="
                    background: rgba(67, 56, 202, 0.9);
                    color: #f8fafc;
                    border: 1px solid rgba(99, 102, 241, 0.6);
                    padding: 8px 18px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                    font-size: 12px;
                    font-weight: 500;
                    letter-spacing: 0.3px;
                    text-transform: none;
                    transition: background 0.2s, filter 0.2s;
                " onmouseover="this.style.background='rgba(99, 102, 241, 1)'; this.style.filter='brightness(1.05)';"
                  onmouseout="this.style.background='rgba(67, 56, 202, 0.9)'; this.style.filter='none';">View All Quizzes</button>
            </div>
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #f8fafc;">🧠 Quiz Decks</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#f8fafc';" onmouseout="this.style.color='#94a3b8';">×</button>
            </div>
            ${deckHTML}
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showDeckQuizzes(topic) {
        const quizzes = this.savedQuizzes.filter(quiz => quiz.deckKey === topic);
        if (quizzes.length === 0) {
            this.game.updateStatus('No quizzes saved for this deck yet.');
            return;
        }

        this.closeAllQuizModals();

        const toProperCase = (text) => {
            if (this.flashcardManager?.toProperCase) {
                return this.flashcardManager.toProperCase(text);
            }
            if (!text) return 'General';
            return text.replace(/\b[a-z]/g, letter => letter.toUpperCase());
        };

        const displayTopic = toProperCase(topic);

        const modal = document.createElement('div');
        modal.className = 'deck-quizzes-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #101827;
            border: 1px solid #2f3542;
            border-radius: 10px;
            padding: 20px;
            max-width: 600px;
            max-height: 75vh;
            overflow-y: auto;
            z-index: 1000;
            color: #e2e8f0;
            font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
            text-transform: none;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.5);
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #f8fafc;">Deck: ${displayTopic}</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#f8fafc';" onmouseout="this.style.color='#94a3b8';">×</button>
            </div>
            <div>
                ${quizzes.map((quiz, index) => `
                    <div style="border: 1px solid #334155; border-radius: 8px; padding: 14px; margin-bottom: 12px; background: rgba(15, 23, 42, 0.6);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="color: #818cf8; font-weight: 600;">Quiz ${index + 1}</div>
                            <div style="color: #64748b; font-size: 12px;">${quiz.questionCount} questions</div>
                        </div>
                        <div style="color: #94a3b8; font-size: 12px; margin: 6px 0;">
                            Saved ${new Date(quiz.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style="color: #a5b4fc; font-size: 12px; margin: 6px 0;">
                            ${quiz.lastScore ? `Last score: ${quiz.lastScore.correct}/${quiz.lastScore.total} (${quiz.lastScore.percentage}%)` : 'No score recorded yet'}
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 10px;">
                            <button onclick="app.playSavedQuiz('${quiz.id}')" style="
                                flex: 1;
                                background: rgba(67, 56, 202, 0.9);
                                color: #f8fafc;
                                border: 1px solid rgba(99, 102, 241, 0.6);
                                border-radius: 6px;
                                padding: 8px 12px;
                                cursor: pointer;
                                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                font-size: 12px;
                                font-weight: 500;
                            ">Start Quiz</button>
                            <button onclick="app.showDeckFlashcards('${topic.replace(/'/g, "\\'")}')" style="
                                flex: 1;
                                background: rgba(37, 99, 235, 0.8);
                                color: #f8fafc;
                                border: 1px solid rgba(96, 165, 250, 0.6);
                                border-radius: 6px;
                                padding: 8px 12px;
                                cursor: pointer;
                                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                font-size: 12px;
                                font-weight: 500;
                            ">Flashcards</button>
                            <button onclick="app.highlightQuizSource('${quiz.id}')" style="
                                flex: 1;
                                background: rgba(15, 23, 42, 0.9);
                                color: #f8fafc;
                                border: 1px solid rgba(99, 102, 241, 0.6);
                                border-radius: 6px;
                                padding: 8px 12px;
                                cursor: pointer;
                                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                font-size: 12px;
                                font-weight: 500;
                            ">Highlight</button>
                            <button onclick="app.deleteQuiz('${quiz.id}')" style="
                                flex: 1;
                                background: rgba(239, 68, 68, 0.15);
                                color: #fecaca;
                                border: 1px solid rgba(248, 113, 113, 0.4);
                                border-radius: 6px;
                                padding: 8px 12px;
                                cursor: pointer;
                                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                font-size: 12px;
                                font-weight: 500;
                            ">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showAllSavedQuizzes() {
        if (!this.savedQuizzes.length) {
            this.game.updateStatus('No saved quizzes available yet.');
            return;
        }

        this.closeAllQuizModals();

        const grouped = this.groupQuizzes();

        const modal = document.createElement('div');
        modal.className = 'all-quiz-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #101827;
            border: 1px solid #2f3542;
            border-radius: 10px;
            padding: 24px;
            max-width: 760px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            color: #e2e8f0;
            font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
            text-transform: none;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.5);
        `;

        let modalHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #f8fafc;">🧠 Complete Quiz Library (${this.savedQuizzes.length} quizzes)</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#f8fafc';" onmouseout="this.style.color='#94a3b8';">×</button>
            </div>
        `;

        [...grouped.entries()].forEach(([topic, quizzes]) => {
            const displayTopic = this.flashcardManager?.toProperCase
                ? this.flashcardManager.toProperCase(topic)
                : topic;
            modalHTML += `
                <div style="margin-bottom: 20px; border: 1px solid #334155; border-radius: 8px; padding: 16px; background: rgba(15, 23, 42, 0.6);">
                    <h4 style="color: #818cf8; margin: 0 0 12px 0; font-weight: 600; letter-spacing: 0.2px;">${displayTopic} (${quizzes.length} quizzes)</h4>
                    ${quizzes.map((quiz, index) => `
                        <div style="border: 1px solid #334155; border-radius: 6px; margin: 8px 0; padding: 10px; background: rgba(15, 23, 42, 0.4);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #f8fafc; font-weight: 600;">Quiz ${index + 1}</span>
                                <span style="color: #64748b; font-size: 12px;">${quiz.questionCount} questions</span>
                            </div>
                            <div style="color: #94a3b8; font-size: 12px; margin: 6px 0;">
                                Saved ${new Date(quiz.createdAt).toLocaleString()}
                            </div>
                            <div style="color: #a5b4fc; font-size: 12px; margin: 6px 0;">
                                ${quiz.lastScore ? `Last score: ${quiz.lastScore.correct}/${quiz.lastScore.total} (${quiz.lastScore.percentage}%)` : 'No score recorded yet'}
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button onclick="app.playSavedQuiz('${quiz.id}')" style="
                                    flex: 1;
                                    background: rgba(67, 56, 202, 0.9);
                                    color: #f8fafc;
                                    border: 1px solid rgba(99, 102, 241, 0.6);
                                    border-radius: 6px;
                                    padding: 8px 12px;
                                    cursor: pointer;
                                    font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                    font-size: 12px;
                                    font-weight: 500;
                                ">Start</button>
                                <button onclick="app.showDeckFlashcards('${topic.replace(/'/g, "\\'")}')" style="
                                    flex: 1;
                                    background: rgba(37, 99, 235, 0.8);
                                    color: #f8fafc;
                                    border: 1px solid rgba(96, 165, 250, 0.6);
                                    border-radius: 6px;
                                    padding: 8px 12px;
                                    cursor: pointer;
                                    font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                    font-size: 12px;
                                    font-weight: 500;
                                ">Flashcards</button>
                                <button onclick="app.highlightQuizSource('${quiz.id}')" style="
                                    flex: 1;
                                    background: rgba(15, 23, 42, 0.9);
                                    color: #f8fafc;
                                    border: 1px solid rgba(99, 102, 241, 0.6);
                                    border-radius: 6px;
                                    padding: 8px 12px;
                                    cursor: pointer;
                                    font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                    font-size: 12px;
                                    font-weight: 500;
                                ">Highlight</button>
                                <button onclick="app.deleteQuiz('${quiz.id}')" style="
                                    flex: 1;
                                    background: rgba(239, 68, 68, 0.15);
                                    color: #fecaca;
                                    border: 1px solid rgba(248, 113, 113, 0.4);
                                    border-radius: 6px;
                                    padding: 8px 12px;
                                    cursor: pointer;
                                    font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                                    font-size: 12px;
                                    font-weight: 500;
                                ">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        });

        modal.innerHTML = modalHTML;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    startSavedQuiz(quizId) {
        const quiz = this.savedQuizzes.find(q => q.id === quizId);
        if (!quiz) {
            this.game.updateStatus('Saved quiz not found.');
            return;
        }

        this.closeAllQuizModals();
        this.activeQuizContext = { quizId: quiz.id };
        this.showQuizModal(quiz.questions);
    }

    highlightQuizSource(quizId) {
        const quiz = this.savedQuizzes.find(q => q.id === quizId);
        if (!quiz) {
            this.game.updateStatus('Saved quiz not found.');
            return;
        }

        const branchId = quiz.branchId || quiz.branch?.id || (quiz.branch ? this.game.treeManager?.assignBranchId(quiz.branch) : null);
        const nodePosition = quiz.nodePosition || (quiz.branch?.end ? { x: quiz.branch.end.x, y: quiz.branch.end.y } : null);

        if (!branchId && !nodePosition) {
            this.game.updateStatus('Unable to locate source node for this quiz.');
            return;
        }

        this.game.highlightNodeAtPosition({ branchId, nodePosition });
    }

    deleteQuiz(quizId) {
        const initialLength = this.savedQuizzes.length;
        this.savedQuizzes = this.savedQuizzes.filter(q => q.id !== quizId);

        if (this.savedQuizzes.length === initialLength) {
            this.game.updateStatus('Quiz not found.');
            return;
        }

        if (this.activeQuizContext?.quizId === quizId) {
            this.activeQuizContext = null;
        }

        this.updateQuizDeckButton();
        this.closeAllQuizModals();
        this.game.updateStatus('Quiz deleted.');
    }

    removeQuizzesFromBranches(removedBranches) {
        if (!removedBranches?.length || !this.savedQuizzes.length) {
            return 0;
        }

        const removedSet = new Set(removedBranches);
        const removedIds = new Set(
            removedBranches.map(branch => branch?.id).filter(Boolean)
        );

        const remaining = this.savedQuizzes.filter(quiz => {
            if (removedSet.has(quiz.branch)) {
                return false;
            }
            if (quiz.branchId && removedIds.has(quiz.branchId)) {
                return false;
            }
            return true;
        });

        const removedCount = this.savedQuizzes.length - remaining.length;
        if (removedCount > 0) {
            this.savedQuizzes = remaining;
            this.updateQuizDeckButton();
        }

        if (this.preparedQuizzes.size > 0 || this.preparingBranches.size > 0) {
            removedIds.forEach(id => {
                if (!id) return;
                this.preparedQuizzes.delete(id);
                this.preparingBranches.delete(id);
            });
        }

        return removedCount;
    }

    closeAllQuizModals() {
        document.querySelectorAll('.quiz-deck-modal, .deck-quizzes-modal, .all-quiz-modal')
            .forEach(modal => modal.remove());
    }

    reset() {
        this.savedQuizzes = [];
        this.activeQuizContext = null;
        this.updateQuizDeckButton();
        this.closeAllQuizModals();
    }
}
