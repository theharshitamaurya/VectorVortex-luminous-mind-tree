/**
 * FlashcardManager encapsulates flashcard creation, storage, and UI flows.
 */
class FlashcardManager {
    constructor(game, apiBaseUrl) {
        this.game = game;
        this.apiBaseUrl = apiBaseUrl;
        this.flashcards = [];
    }

    hasFlashcards() {
        return this.flashcards.length > 0;
    }

    getDeckKey(card) {
        if (!card) {
            return 'General';
        }

        const branch = card.branch;
        if (branch && branch.searchResult) {
            const parent = this.findParentMainTopicBranch(branch);
            if (parent?.searchResult?.title) {
                return parent.searchResult.title;
            }
            if (branch.searchResult.title) {
                return branch.searchResult.title;
            }
        }

        return card.category || card.topic || 'General';
    }

    groupFlashcards() {
        const grouped = new Map();

        this.flashcards.forEach(card => {
            const key = this.getDeckKey(card);
            card.deckKey = key;
            card.category = key;

            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(card);
        });

        return grouped;
    }

    getFlashcardsForTopic(topic) {
        const grouped = this.groupFlashcards();
        return grouped.has(topic) ? [...grouped.get(topic)] : [];
    }

    getRandomFlashcards(count, sourceFlashcards = null) {
        const pool = [...(sourceFlashcards || this.flashcards)].sort(() => Math.random() - 0.5);
        const limit = Math.min(count, pool.length);
        return pool.slice(0, limit);
    }

    getFlashcardsForBranch(branch) {
        if (!branch) {
            return [];
        }
        return this.flashcards.filter(card => card.branch === branch || card.branchId === branch.id);
    }

    async createFlashcardsForNode(node) {
        try {
            const branch = this.game.tree.branches.find(b =>
                Math.abs(b.end.x - node.x) < 8 && Math.abs(b.end.y - node.y) < 8
            );

            if (!branch || !branch.searchResult) {
                this.game.updateStatus('No search data available for this node');
                return;
            }

            if (!branch.searchResult.title ||
                (!branch.searchResult.llm_content && !branch.searchResult.snippet)) {
                this.game.updateStatus('Insufficient search data for flashcard creation');
                console.error('Invalid search result data:', branch.searchResult);
                return;
            }

            this.game.updateStatus('Loading flashcards...');

            const nodeX = node.x || node.end?.x || 0;
            const nodeY = node.y || node.end?.y || 0;

            this.game.addLeavesToNode(node, 5);

            const payload = {
                search_result: branch.searchResult,
                count: 5,
                node_position: { x: nodeX, y: nodeY }
            };

            console.log('Requesting flashcards with payload:', payload);

            const response = await fetch(`${this.apiBaseUrl}/api/create-flashcards`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawText = await response.text();
            console.log('Flashcard API raw response:', rawText);

            let data;
            try {
                data = JSON.parse(rawText);
            } catch (error) {
                console.error('Unable to parse flashcard response:', error);
                throw new Error('Failed to parse JSON response');
            }

            if (!data.success) {
                console.error('Flashcard generation failed:', data.error);
                this.game.updateStatus(`Failed to create flashcards: ${data.error}`);
                return;
            }

            const branchId = branch.id || (this.game.treeManager?.assignBranchId
                ? this.game.treeManager.assignBranchId(branch)
                : null);
            const defaultNodePosition = {
                x: branch?.end?.x ?? nodeX,
                y: branch?.end?.y ?? nodeY
            };

            const cards = data.flashcards.map(card => ({
                ...card,
                id: `flashcard_${Date.now()}_${Math.floor(Math.random() * 10000)}_${Math.random().toString(36).slice(2, 6)}`,
                front: this.toProperCase(card.front),
                back: this.toProperCase(card.back),
                branch,
                branchId,
                node_position: card.node_position || defaultNodePosition
            }));

            this.flashcards.push(...cards);
            this.updateFlashcardDeck();
            this.ensureFlashcardStyles();

            this.game.updateStatus(`Created ${cards.length} flashcards for ${branch.searchResult.title}`);
            this.game.updateStatus('Flashcards ready!');
        } catch (error) {
            console.error('Error creating flashcards:', error);
            this.game.updateStatus('Error creating flashcards');
        }
    }

    updateFlashcardDeck() {
        let deckElement = document.getElementById('flashcard-deck');
        if (!deckElement) {
            deckElement = document.createElement('div');
            deckElement.id = 'flashcard-deck';
            deckElement.style.cssText = `
                position: fixed;
                bottom: 50px;
                left: 20px;
                z-index: 100;
                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                text-transform: none;
            `;
            document.body.appendChild(deckElement);
        }

        if (!this.hasFlashcards()) {
            deckElement.innerHTML = '';
            return;
        }

        this.ensureFlashcardStyles();
        this.flashcards.forEach(card => {
            if (!card.id) {
                card.id = `flashcard_${Date.now()}_${Math.floor(Math.random() * 10000)}_${Math.random().toString(36).slice(2, 6)}`;
            }
        });

        const grouped = this.groupFlashcards();
        const totalCards = this.flashcards.length;
        const totalDecks = grouped.size;

        deckElement.innerHTML = `
            <button onclick="app.showDeckView()" style="
                background: rgba(67, 56, 202, 0.9);
                border: 1px solid rgba(99, 102, 241, 0.6);
                border-radius: 8px;
                padding: 10px 16px;
                color: #f8fafc;
                font-family: 'JetBrains Mono', 'Source Code Pro', 'Fira Code', 'Courier New', monospace;
                font-size: 13px;
                font-weight: 500;
                letter-spacing: 0.3px;
                text-transform: none;
                cursor: pointer;
                box-shadow: 0 6px 18px rgba(15, 23, 42, 0.35);
                transition: background 0.2s, filter 0.2s;
            " onmouseover="this.style.background='rgba(99, 102, 241, 1)'; this.style.filter='brightness(1.05)';"
              onmouseout="this.style.background='rgba(67, 56, 202, 0.9)'; this.style.filter='none';">
                📚 Flashcard Decks (${totalDecks} decks, ${totalCards} cards)
            </button>
        `;
    }

    showDeckView() {
        if (!this.hasFlashcards()) {
            this.game.updateStatus('No flashcards created yet');
            return;
        }

        const grouped = this.groupFlashcards();

        const modal = document.createElement('div');
        modal.className = 'deck-view-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 10px;
            padding: 20px;
            min-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            color: white;
        `;

        let deckHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px; font-weight: 600;">📚 Flashcard Decks</h3>
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 5px; font-weight: 600; color: #ccc;">
                    <div>Deck</div>
                    <div>Cards</div>
                </div>
        `;

        [...grouped.entries()].forEach(([topic, cards]) => {
            deckHTML += `
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px; border-radius: 5px; cursor: pointer; transition: background 0.2s;"
                     onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                     onmouseout="this.style.background='transparent'"
                     onclick="app.showDeckFlashcards('${topic.replace(/'/g, "\\'")}')">
                    <div style="color: #fff; font-weight: 500;">${topic}</div>
                    <div style="color: #fff; font-weight: 600;">${cards.length}</div>
                </div>
            `;
        });

        deckHTML += `
            </div>
            <div style="text-align: center; margin-top: 10px;">
                <button onclick="app.showAllFlashcards()" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-family: 'Inter', sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                ">View All Cards</button>
            </div>
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #fff;">📚 Flashcard Decks</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">×</button>
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

    showDeckFlashcards(topic) {
        const cards = this.getFlashcardsForTopic(topic);
        if (cards.length === 0) {
            this.game.updateStatus('No flashcards found for this topic');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'deck-flashcards-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 10px;
            padding: 20px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;

        const defaultPosition = (card) => card.node_position || { x: card.branch?.end?.x || 0, y: card.branch?.end?.y || 0 };

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #fff;">Deck: ${topic}</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">×</button>
            </div>
            <div id="deck-flashcards-container">
                ${cards.map((card, index) => `
                    <div class="flashcard" style="border: 1px solid #334155; border-radius: 8px; margin: 10px 0; padding: 16px; background: #2a2a2a; cursor: pointer; font-family: 'Inter', sans-serif;" data-card-id='${card.id}' data-node-position='${JSON.stringify(defaultPosition(card))}' data-branch-id='${card.branchId || card.branch?.id || ''}'>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="color: #3b82f6; font-weight: bold;">Card ${index + 1}</span>
                            <span style="color: #666; font-size: 12px;">${card.difficulty}</span>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <strong style="color: #fff;">Q:</strong> ${this.game.formatContent(card.front)}
                        </div>
                        <div style="margin-bottom: 10px;">
                            <strong style="color: #fff;">A:</strong> ${this.game.formatContent(card.back)}
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 12px;">
                            <button onclick="event.stopPropagation(); app.highlightFlashcardSource('${card.id}');" style="
                                flex: 1;
                                background: rgba(67, 56, 202, 0.9);
                                color: #f8fafc;
                                border: 1px solid rgba(99, 102, 241, 0.6);
                                border-radius: 6px;
                                padding: 6px 10px;
                                cursor: pointer;
                                font-family: inherit;
                                font-size: 12px;
                                font-weight: 600;
                            ">Highlight</button>
                            <button onclick="event.stopPropagation(); app.deleteFlashcard('${card.id}');" style="
                                flex: 1;
                                background: rgba(239, 68, 68, 0.15);
                                color: #fecaca;
                                border: 1px solid rgba(248, 113, 113, 0.4);
                                border-radius: 6px;
                                padding: 6px 10px;
                                cursor: pointer;
                                font-family: inherit;
                                font-size: 12px;
                                font-weight: 600;
                            ">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.flashcard').forEach(element => {
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                const branchId = element.dataset.branchId;
                let nodePosition = null;
                if (element.dataset.nodePosition) {
                    try {
                        nodePosition = JSON.parse(element.dataset.nodePosition);
                    } catch (error) {
                        console.warn('Invalid node position data:', error);
                    }
                }
                this.highlightNodeFromFlashcard({ branchId, nodePosition });
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showFlashcards(flashcards, topic) {
        const modal = document.createElement('div');
        modal.className = 'flashcard-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 10px;
            padding: 20px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;

        const defaultPosition = (card) => card.node_position || { x: card.branch?.end?.x || 0, y: card.branch?.end?.y || 0 };

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #fff;">Flashcards: ${topic}</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">×</button>
            </div>
            <div id="flashcards-container">
                ${flashcards.map((card, index) => `
                    <div class="flashcard" style="border: 1px solid #334155; border-radius: 8px; margin: 10px 0; padding: 16px; background: #2a2a2a; cursor: pointer; font-family: 'Inter', sans-serif;" data-card-id='${card.id}' data-node-position='${JSON.stringify(defaultPosition(card))}' data-branch-id='${card.branchId || card.branch?.id || ''}'>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="color: #3b82f6; font-weight: bold;">Card ${index + 1}</span>
                            <span style="color: #666; font-size: 12px;">${card.difficulty}</span>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <strong style="color: #fff;">Q:</strong> ${this.game.formatContent(card.front)}
                        </div>
                        <div style="margin-bottom: 10px;">
                            <strong style="color: #fff;">A:</strong> ${this.game.formatContent(card.back)}
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 12px;">
                            <button onclick="event.stopPropagation(); app.highlightFlashcardSource('${card.id}');" style="
                                flex: 1;
                                background: rgba(67, 56, 202, 0.9);
                                color: #f8fafc;
                                border: 1px solid rgba(99, 102, 241, 0.6);
                                border-radius: 6px;
                                padding: 6px 10px;
                                cursor: pointer;
                                font-family: inherit;
                                font-size: 12px;
                                font-weight: 600;
                            ">Highlight</button>
                            <button onclick="event.stopPropagation(); app.deleteFlashcard('${card.id}');" style="
                                flex: 1;
                                background: rgba(239, 68, 68, 0.15);
                                color: #fecaca;
                                border: 1px solid rgba(248, 113, 113, 0.4);
                                border-radius: 6px;
                                padding: 6px 10px;
                                cursor: pointer;
                                font-family: inherit;
                                font-size: 12px;
                                font-weight: 600;
                            ">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.flashcard').forEach(element => {
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                const branchId = element.dataset.branchId;
                let nodePosition = null;
                if (element.dataset.nodePosition) {
                    try {
                        nodePosition = JSON.parse(element.dataset.nodePosition);
                    } catch (error) {
                        console.warn('Invalid node position data:', error);
                    }
                }
                this.highlightNodeFromFlashcard({ branchId, nodePosition });
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showFlashcardsForTopic(topic) {
        const cards = this.getFlashcardsForTopic(topic);
        if (cards.length === 0) {
            this.game.updateStatus('No flashcards found for this topic');
            return;
        }
        this.showFlashcards(cards, topic);
    }

    showAllFlashcards() {
        if (!this.hasFlashcards()) {
            this.game.updateStatus('No flashcards created yet');
            return;
        }

        const grouped = this.groupFlashcards();

        const modal = document.createElement('div');
        modal.className = 'all-flashcards-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 10px;
            padding: 20px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            color: white;
            font-family: 'Inter', sans-serif;
        `;

        let modalHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #fff;">📚 Complete Flashcard Deck (${this.flashcards.length} cards)</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">×</button>
            </div>
        `;

        [...grouped.entries()].forEach(([topic, cards]) => {
            modalHTML += `
                <div style="margin-bottom: 20px; border: 1px solid #333; border-radius: 5px; padding: 15px;">
                    <h4 style="color: #3b82f6; margin: 0 0 10px 0;">${topic} (${cards.length} cards)</h4>
                    ${cards.map((card, index) => `
                        <div style="border: 1px solid #444; border-radius: 3px; margin: 8px 0; padding: 12px; background: #2a2a2a; font-family: 'Inter', sans-serif;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="color: #3b82f6; font-weight: bold;">Card ${index + 1}</span>
                                <span style="color: #666; font-size: 12px;">${card.difficulty}</span>
                            </div>
                            <div class="flashcard-content">
                                <strong>Q:</strong> ${this.game.formatContent(card.front)}
                            </div>
                            <div class="flashcard-content">
                                <strong>A:</strong> ${this.game.formatContent(card.back)}
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <button onclick="app.highlightFlashcardSource('${card.id}')" style="
                                    flex: 1;
                                    background: rgba(67, 56, 202, 0.9);
                                    color: #f8fafc;
                                    border: 1px solid rgba(99, 102, 241, 0.6);
                                    border-radius: 6px;
                                    padding: 6px 10px;
                                    cursor: pointer;
                                    font-family: inherit;
                                    font-size: 12px;
                                    font-weight: 600;
                                ">Highlight</button>
                                <button onclick="app.deleteFlashcard('${card.id}')" style="
                                    flex: 1;
                                    background: rgba(239, 68, 68, 0.15);
                                    color: #fecaca;
                                    border: 1px solid rgba(248, 113, 113, 0.4);
                                    border-radius: 6px;
                                    padding: 6px 10px;
                                    cursor: pointer;
                                    font-family: inherit;
                                    font-size: 12px;
                                    font-weight: 600;
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

    highlightNodeFromFlashcard(identifier) {
        if (!identifier) {
            console.warn('No highlight identifier provided');
            return;
        }

        let branchId = identifier.branchId || identifier.branch_id;
        if (branchId === '' || branchId === 'null' || branchId === 'undefined') {
            branchId = null;
        }

        let nodePosition = identifier.nodePosition || identifier.node_position;
        if (!nodePosition && typeof identifier.x === 'number' && typeof identifier.y === 'number') {
            nodePosition = { x: identifier.x, y: identifier.y };
        }

        this.closeAllDeckModals();

        let target = null;

        if (branchId) {
            target = this.game.tree.branches.find(branch => String(branch.id) === String(branchId));
        }

        if (!target && identifier.branch) {
            target = identifier.branch;
        }

        if (!target && nodePosition && nodePosition.x !== undefined && nodePosition.y !== undefined) {
            target = this.game.tree.branches.find(branch => {
                const distanceX = Math.abs(branch.end.x - nodePosition.x);
                const distanceY = Math.abs(branch.end.y - nodePosition.y);
                return distanceX < 20 && distanceY < 20;
            });
        }

        if (!target) {
            this.game.updateStatus('Source node not found on tree');
            return;
        }

        this.game.cameraOffset.x = -target.end.x + this.game.canvas.width / 2;
        this.game.cameraOffset.y = -target.end.y + this.game.canvas.height / 2;

        this.game.highlightedNode = target;
        this.game.highlightStartTime = Date.now();

        if (this.game.highlightTimeout) {
            clearTimeout(this.game.highlightTimeout);
        }

        this.game.highlightTimeout = setTimeout(() => {
            this.game.highlightedNode = null;
            this.game.highlightStartTime = null;
        }, 3000);

        if (target.searchResult?.title) {
            this.game.updateStatus(`Highlighted source node: ${target.searchResult.title}`);
        } else {
            this.game.updateStatus('Highlighted source node');
        }
    }

    deleteFlashcard(cardId) {
        if (!cardId) {
            return;
        }

        const initialLength = this.flashcards.length;
        this.flashcards = this.flashcards.filter(card => card.id !== cardId);

        if (this.flashcards.length !== initialLength) {
            this.updateFlashcardDeck();
            this.closeAllDeckModals();
            this.game.updateStatus('Flashcard deleted.');
        } else {
            this.game.updateStatus('Flashcard not found.');
        }
    }

    removeFlashcardsFromBranches(removedBranches) {
        if (!removedBranches?.length) {
            return 0;
        }

        const removedSet = new Set(removedBranches);
        const removedIds = new Set(
            removedBranches
                .map(branch => branch?.id)
                .filter(Boolean)
        );
        const remaining = this.flashcards.filter(card => {
            if (removedSet.has(card.branch)) {
                return false;
            }
            if (card.branchId && removedIds.has(card.branchId)) {
                return false;
            }
            return true;
        });
        const removedCount = this.flashcards.length - remaining.length;

        if (removedCount > 0) {
            this.flashcards.length = 0;
            this.flashcards.push(...remaining);
            this.updateFlashcardDeck();
        }

        return removedCount;
    }

    ensureFlashcardStyles() {
        if (document.getElementById('flashcard-content-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'flashcard-content-styles';
        style.textContent = `
            .flashcard-content {
                font-family: 'Inter', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #f8fafc;
                margin-bottom: 10px;
            }

            .flashcard-content strong {
                font-weight: 600;
                margin-right: 6px;
                color: inherit;
            }

            .flashcard-content p {
                margin: 0 0 6px 0;
                color: inherit;
                font-family: inherit;
            }

            .flashcard-content p:last-child {
                margin-bottom: 0;
            }
        `;
        document.head.appendChild(style);
    }

    reset() {
        if (this.flashcards.length > 0) {
            this.flashcards.length = 0;
        }
        this.closeAllDeckModals();
        const deckElement = document.getElementById('flashcard-deck');
        if (deckElement) {
            deckElement.remove();
        }
        this.hideLoadingMessage();
    }

    closeAllDeckModals() {
        document.querySelectorAll('.deck-view-modal, .deck-flashcards-modal, .flashcard-modal, .all-flashcards-modal')
            .forEach(modal => modal.remove());
    }

    showLoadingMessage(message) {
        this.hideLoadingMessage();

        const loadingElement = document.createElement('div');
        loadingElement.id = 'loading-message';
        loadingElement.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(26, 26, 26, 0.95);
            border: 2px solid #333;
            border-radius: 10px;
            padding: 15px 20px;
            color: white;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: fadeIn 0.3s ease-in;
            min-width: 200px;
        `;
        loadingElement.textContent = message;

        if (!document.getElementById('loading-styles')) {
            const style = document.createElement('style');
            style.id = 'loading-styles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(loadingElement);
    }

    hideLoadingMessage() {
        const loadingElement = document.getElementById('loading-message');
        if (!loadingElement) {
            return;
        }

        loadingElement.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            if (loadingElement.parentNode) {
                loadingElement.parentNode.removeChild(loadingElement);
            }
        }, 300);
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

    findParentMainTopicBranch(childBranch) {
        let currentBranch = childBranch;
        while (currentBranch) {
            if (currentBranch.generation === 0 || currentBranch.generation === 1) {
                return currentBranch;
            }
            currentBranch = currentBranch.parent || null;
        }
        return childBranch;
    }
}
