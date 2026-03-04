window.TreeManager = class TreeManager {
    constructor(game) {
        this.game = game;
    }

    initializeTree() {
        const baseTree = this.game.tree || {};
        this.game.tree = {
            x: this.game.width / 2,
            y: (this.game.initialHeight || this.game.height) - 40,
            trunkHeight: 80,
            branches: baseTree.branches || [],
            leaves: baseTree.leaves || [],
            fruits: baseTree.fruits || [],
            flowers: baseTree.flowers || [],
            oldX: baseTree.oldX || 0,
            oldY: baseTree.oldY || 0
        };

        this.game.lightSource = {
            x: this.game.width / 2,
            y: 80,
            radius: 25
        };

        if (this.game.tree.branches.length > 0) {
            this.repositionTreeAssets();
        }
    }

    loadLeavesFromSavedData() {
        if (this.game.tree?.leaves?.length > 0) {
            console.log('Loading', this.game.tree.leaves.length, 'leaves from saved data');
        }
    }

    update(deltaTime) {
        if (this.game.gameState !== 'playing' || !this.game.tree) {
            return;
        }

        const trunkTop = {
            x: this.game.tree.x,
            y: this.game.tree.y - this.game.tree.trunkHeight
        };
        const t = performance.now() * 0.001;

        this.game.tree.branches.forEach(branch => {
            const growthRate = 1.5 + Math.random() * 0.7;
            branch.length += growthRate * deltaTime * 0.01;

            if (branch.length > branch.maxLength) {
                branch.length = branch.maxLength;
            }

            if (typeof branch.baseAngle !== 'number') {
                branch.baseAngle = Math.atan2(branch.end.y - branch.start.y, branch.end.x - branch.start.x);
            }
            if (typeof branch.windPhase !== 'number') {
                branch.windPhase = Math.random() * Math.PI * 2;
            }

            if (branch.parent) {
                branch.start.x = branch.parent.end.x;
                branch.start.y = branch.parent.end.y;
            } else {
                branch.start.x = trunkTop.x;
                branch.start.y = trunkTop.y;
            }

            const generation = branch.generation || 1;
            const windStrength = Math.max(0.005, 0.028 - generation * 0.0035);
            const wind = Math.sin(t * 1.6 + branch.windPhase) * windStrength;
            const currentAngle = branch.baseAngle + wind;

            branch.end.x = branch.start.x + Math.cos(currentAngle) * branch.length;
            branch.end.y = branch.start.y + Math.sin(currentAngle) * branch.length;
        });
    }

    getNodeAtPosition(pos) {
        if (!this.game.tree) {
            return null;
        }

        const adjustedPos = {
            x: pos.x - this.game.cameraOffset.x,
            y: pos.y - this.game.cameraOffset.y
        };

        const trunkPoint = { x: this.game.tree.x, y: this.game.tree.y - this.game.tree.trunkHeight };
        if (Math.abs(adjustedPos.x - trunkPoint.x) < 8 && Math.abs(adjustedPos.y - trunkPoint.y) < 8) {
            const originalQuery = this.game.searchManager.getOriginalQuery();
            if (originalQuery) {
                return {
                    x: trunkPoint.x,
                    y: trunkPoint.y,
                    searchResult: {
                        title: originalQuery,
                        snippet: originalQuery,
                        llm_content: `This is your main topic: ${originalQuery}. The branches below represent the 5 primary areas within this field.`
                    }
                };
            }
            return trunkPoint;
        }

        if (this.game.currentTool === 'harvest') {
            for (const fruit of this.game.tree.fruits) {
                if (Math.abs(adjustedPos.x - fruit.x) < 15 && Math.abs(adjustedPos.y - fruit.y) < 15) {
                    return { x: fruit.x, y: fruit.y, isFruit: true, fruit };
                }
            }
        }

        if (this.game.currentTool === 'fruit') {
            for (const flower of this.game.tree.flowers) {
                if (Math.abs(adjustedPos.x - flower.x) < 12 && Math.abs(adjustedPos.y - flower.y) < 12) {
                    return { x: flower.x, y: flower.y, isFlower: true, flower };
                }
            }
        }

        for (const branch of this.game.tree.branches) {
            if (branch.length >= branch.maxLength) {
                if (Math.abs(adjustedPos.x - branch.end.x) < 8 && Math.abs(adjustedPos.y - branch.end.y) < 8) {
                    if (branch.searchResult) {
                        return { x: branch.end.x, y: branch.end.y, searchResult: branch.searchResult };
                    }
                    return { x: branch.end.x, y: branch.end.y };
                }
            }
        }

        return null;
    }

    growBranchesFromNode(node) {
        if (!node) {
            this.game.updateStatus('Select a node to grow from.');
            return;
        }

        console.log('Growing branches from node:', node);

        const existingBranches = this.game.tree.branches.filter(branch => {
            return Math.abs(branch.start.x - node.x) < 5 &&
                   Math.abs(branch.start.y - node.y) < 5;
        });

        if (existingBranches.length >= 6) {
            this.game.updateStatus('Maximum branches reached for this node!');
            return;
        }

        const trunkTop = {
            x: this.game.tree.x,
            y: this.game.tree.y - this.game.tree.trunkHeight
        };
        const isTrunkTop = Math.abs(node.x - trunkTop.x) < 5 && Math.abs(node.y - trunkTop.y) < 5;

        if (isTrunkTop && existingBranches.length === 0) {
            this.createInitialFanBranches(node);
        } else {
            const branchCount = 3 + Math.floor(Math.random() * 3);
            const newBranches = [];
            for (let i = 0; i < branchCount; i++) {
                const branch = this.addBranchFromNode(node);
                newBranches.push(branch);
            }

            this.game.searchManager.assignResultsToBranches(node, newBranches);
            this.game.updateStatus(`Grew ${branchCount} branches from node!`);
        }
    }

    createInitialFanBranches(node) {
        const branchCount = 5;
        const angleSpread = Math.PI * 0.8;

        const trunkTop = {
            x: this.game.tree.x,
            y: this.game.tree.y - this.game.tree.trunkHeight
        };

        for (let i = 0; i < branchCount; i++) {
            const angle = -angleSpread / 2 + (angleSpread / (branchCount - 1)) * i;
            const length = 120 + Math.random() * 60;
            const upwardAngle = angle - Math.PI / 2;

            const branch = {
                start: { x: trunkTop.x, y: trunkTop.y },
                end: {
                    x: trunkTop.x + Math.cos(upwardAngle) * length,
                    y: trunkTop.y + Math.sin(upwardAngle) * length
                },
                length: 0,
                maxLength: length,
                angle: upwardAngle,
                baseAngle: upwardAngle,
                windPhase: Math.random() * Math.PI * 2,
                thickness: 15,
                generation: 1,
                parent: null
            };

            this.assignBranchId(branch);
            this.game.tree.branches.push(branch);
        }

        const lastFiveBranches = this.game.tree.branches.slice(-5);
        this.game.searchManager.assignInitialResults(lastFiveBranches);
        this.game.updateStatus(`Grew ${branchCount} branches from trunk!`);
    }

    addBranchFromNode(startPoint) {
        const baseLength = 25 + Math.random() * 40;
        const maxLength = baseLength * (2.0 + Math.random() * 1.5);

        let angle;
        let parentBranch = null;
        const trunkTop = {
            x: this.game.tree.x,
            y: this.game.tree.y - this.game.tree.trunkHeight
        };

        if (Math.abs(startPoint.x - trunkTop.x) < 5 && Math.abs(startPoint.y - trunkTop.y) < 5) {
            angle = (Math.random() - 0.5) * Math.PI * 1.2 - Math.PI * 0.1;
        } else {
            parentBranch = this.game.tree.branches.find(b =>
                Math.abs(b.end.x - startPoint.x) < 5 &&
                Math.abs(b.end.y - startPoint.y) < 5
            );
            const parentAngle = parentBranch ?
                Math.atan2(parentBranch.end.y - parentBranch.start.y, parentBranch.end.x - parentBranch.start.x) :
                0;
            angle = parentAngle + (Math.random() - 0.5) * Math.PI * 0.8;
        }

        const thickness = this.calculateBranchThicknessFromParent(startPoint);

        const branch = {
            start: { x: startPoint.x, y: startPoint.y },
            end: {
                x: startPoint.x + Math.cos(angle) * baseLength,
                y: startPoint.y + Math.sin(angle) * baseLength
            },
            length: baseLength,
            maxLength,
            baseAngle: angle,
            windPhase: Math.random() * Math.PI * 2,
            thickness,
            generation: parentBranch ? parentBranch.generation + 1 : 1,
            parent: parentBranch
        };

        this.assignBranchId(branch);
        this.game.tree.branches.push(branch);
        return branch;
    }

    calculateBranchThicknessFromParent(startPoint) {
        const trunkTop = {
            x: this.game.tree.x,
            y: this.game.tree.y - this.game.tree.trunkHeight
        };

        if (Math.abs(startPoint.x - trunkTop.x) < 5 && Math.abs(startPoint.y - trunkTop.y) < 5) {
            return 10;
        }

        const parentBranch = this.game.tree.branches.find(b =>
            Math.abs(b.end.x - startPoint.x) < 5 &&
            Math.abs(b.end.y - startPoint.y) < 5
        );

        if (parentBranch) {
            const parentThickness = parentBranch.thickness || 5;
            const reduction = parentThickness > 6 ? 3 : 2;
            return Math.max(1, parentThickness - reduction);
        }

        return 5;
    }

    growLeavesOnNode(node) {
        if (!node) {
            this.game.updateStatus('No node selected for leaves!');
            return;
        }

        console.log('Growing leaves on node at:', node.x, node.y);

        const branchesFromNode = this.game.tree.branches.filter(branch => {
            return Math.abs(branch.start.x - node.x) < 5 &&
                   Math.abs(branch.start.y - node.y) < 5;
        });

        if (branchesFromNode.length === 0) {
            this.game.updateStatus('No branches found at this node!');
            return;
        }

        let leavesAdded = 0;
        branchesFromNode.forEach(branch => {
            const leafCount = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < leafCount; i++) {
                const t = (i + 1) / (leafCount + 1);
                const leafX = branch.start.x + (branch.end.x - branch.start.x) * t;
                const leafY = branch.start.y + (branch.end.y - branch.start.y) * t;

                const offsetX = (Math.random() - 0.5) * 6;
                const offsetY = (Math.random() - 0.5) * 6;

                this.game.tree.leaves.push({
                    x: leafX + offsetX,
                    y: leafY + offsetY,
                    size: 8 + Math.random() * 8,
                    angle: Math.random() * Math.PI * 2,
                    sway: Math.random() * Math.PI * 2,
                    branch,
                    t,
                    offsetX,
                    offsetY
                });
                leavesAdded++;
            }
        });

        this.game.updateStatus(`Grew ${leavesAdded} leaves on ${branchesFromNode.length} branches!`);
    }

    transformFlowerToFruit(node) {
        if (!node || !node.isFlower || !node.flower) {
            this.game.updateStatus('Bear fruit of labour only works on flowers! Click on a flower to transform it.');
            return;
        }

        console.log('Transforming flower to fruit at:', node.x, node.y);
        const flower = node.flower;

        const existingFruit = this.game.tree.fruits.find(fruit =>
            Math.abs(fruit.x - flower.x) < 10 && Math.abs(fruit.y - flower.y) < 10
        );

        if (existingFruit) {
            this.game.updateStatus('Fruit already exists on this branch end!');
            return;
        }

        this.game.tree.flowers = this.game.tree.flowers.filter(f => f !== flower);

        const fruitType = '🍎';
        const targetSize = 36 + Math.random() * 16;
        this.game.tree.fruits.push({
            x: flower.x,
            y: flower.y,
            type: fruitType,
            size: targetSize,
            targetSize,
            growthProgress: 0,
            sway: Math.random() * Math.PI * 2,
            branch: flower.branch
        });

        if (this.game.quizManager) {
            this.game.quizManager.prepareQuizForBranch(flower.branch);
        }

        this.game.updateStatus(`Transformed ${flower.type} into ${fruitType} - fruit of labour!`);
    }

    growFlowerOnNode(node) {
        if (!node) {
            this.game.updateStatus('Hover over an end node first, then click to blossom knowledge!');
            return;
        }

        console.log('Growing flower on node at:', node.x, node.y);
        const trunkPoint = { x: this.game.tree.x, y: this.game.tree.y - this.game.tree.trunkHeight };
        if (Math.abs(node.x - trunkPoint.x) < 5 && Math.abs(node.y - trunkPoint.y) < 5) {
            this.game.updateStatus('Flowers can only grow on branch ends, not the trunk!');
            return;
        }

        const isEndNode = this.game.tree.branches.some(branch => {
            return Math.abs(branch.end.x - node.x) < 5 &&
                   Math.abs(branch.end.y - node.y) < 5 &&
                   branch.length >= branch.maxLength;
        });

        if (!isEndNode) {
            this.game.updateStatus('Flowers can only grow on fully grown branch ends!');
            return;
        }

        const targetBranch = this.game.tree.branches.find(branch =>
            Math.abs(branch.end.x - node.x) < 5 &&
            Math.abs(branch.end.y - node.y) < 5
        );

        if (!targetBranch) {
            this.game.updateStatus('Unable to identify branch for this node.');
            return;
        }

        const branchHasLeaves = this.game.tree.leaves.some(leaf => leaf.branch === targetBranch);
        if (!branchHasLeaves) {
            this.game.updateStatus('Grow some leaves on this branch before blossoming a flower!');
            return;
        }

        const hasFruit = this.game.tree.fruits.some(fruit => fruit.branch === targetBranch &&
            Math.abs(fruit.x - node.x) < 10 && Math.abs(fruit.y - node.y) < 10);
        if (hasFruit) {
            this.game.updateStatus('Remove the fruit first before blossoming another flower!');
            return;
        }

        const existingFlower = this.game.tree.flowers.find(flower =>
            Math.abs(flower.x - node.x) < 10 && Math.abs(flower.y - node.y) < 10
        );

        if (existingFlower) {
            this.game.updateStatus('Flower already exists on this branch end!');
            return;
        }

        const flowerTypes = ['🌸', '🌺', '🌼'];
        const flowerType = flowerTypes[Math.floor(Math.random() * flowerTypes.length)];

        this.game.tree.flowers.push({
            x: node.x,
            y: node.y,
            type: flowerType,
            size: 28 + Math.random() * 12,
            sway: Math.random() * Math.PI * 2,
            branch: targetBranch
        });

        this.game.updateStatus(`Blossomed knowledge with ${flowerType} on branch end!`);
    }

    repositionNode(node, newPos) {
        if (!node || !this.game.tree) {
            return;
        }

        const branchToReposition = this.game.tree.branches.find(branch =>
            Math.abs(branch.end.x - node.x) < 5 &&
            Math.abs(branch.end.y - node.y) < 5
        );

        if (!branchToReposition) {
            return;
        }

        const adjustedPos = {
            x: newPos.x - this.game.cameraOffset.x,
            y: newPos.y - this.game.cameraOffset.y
        };

        const trunkPoint = { x: this.game.tree.x, y: this.game.tree.y - this.game.tree.trunkHeight };
        if (Math.abs(node.x - trunkPoint.x) < 5 && Math.abs(node.y - trunkPoint.y) < 5) {
            this.game.updateStatus('Cannot reposition the trunk!');
            return;
        }

        const dx = adjustedPos.x - branchToReposition.start.x;
        const dy = adjustedPos.y - branchToReposition.start.y;
        const newLength = Math.sqrt(dx * dx + dy * dy);
        const clampedLength = Math.max(5, Math.min(200, newLength));
        const angle = Math.atan2(dy, dx);

        branchToReposition.end.x = branchToReposition.start.x + Math.cos(angle) * clampedLength;
        branchToReposition.end.y = branchToReposition.start.y + Math.sin(angle) * clampedLength;
        branchToReposition.length = clampedLength;
        branchToReposition.maxLength = clampedLength;

        this.game.tree.branches.forEach(childBranch => {
            if (Math.abs(childBranch.start.x - node.x) < 5 &&
                Math.abs(childBranch.start.y - node.y) < 5) {
                childBranch.start.x = branchToReposition.end.x;
                childBranch.start.y = branchToReposition.end.y;
            }
        });

        node.x = branchToReposition.end.x;
        node.y = branchToReposition.end.y;

        this.updateLeavesOnBranch(branchToReposition);
    }

    updateLeavesOnBranch(branch) {
        this.game.tree.leaves.forEach(leaf => {
            if (leaf.branch === branch) {
                const leafX = branch.start.x + (branch.end.x - branch.start.x) * leaf.t;
                const leafY = branch.start.y + (branch.end.y - branch.start.y) * leaf.t;
                leaf.x = leafX + leaf.offsetX;
                leaf.y = leafY + leaf.offsetY;
            }
        });
    }

    repositionTreeAssets() {
        if (!this.game.tree) {
            return;
        }

        const treeOffsetX = this.game.tree.x - (this.game.tree.oldX || this.game.tree.x);
        const treeOffsetY = this.game.tree.y - (this.game.tree.oldY || this.game.tree.y);

        this.game.tree.branches.forEach(branch => {
            branch.start.x += treeOffsetX;
            branch.start.y += treeOffsetY;
            branch.end.x += treeOffsetX;
            branch.end.y += treeOffsetY;
        });

        this.game.tree.leaves.forEach(leaf => {
            leaf.x += treeOffsetX;
            leaf.y += treeOffsetY;
        });

        this.game.tree.fruits.forEach(fruit => {
            fruit.x += treeOffsetX;
            fruit.y += treeOffsetY;
        });

        this.game.tree.flowers.forEach(flower => {
            flower.x += treeOffsetX;
            flower.y += treeOffsetY;
        });

        if (this.game.fallingFruits?.length) {
            this.game.fallingFruits.forEach(fruit => {
                fruit.x += treeOffsetX;
                fruit.y += treeOffsetY;
            });
        }

        this.game.tree.oldX = this.game.tree.x;
        this.game.tree.oldY = this.game.tree.y;
    }

    addLeavesToNode(node, count) {
        if (!node || !count) {
            return;
        }

        const nodeX = node.x || node.end?.x || 0;
        const nodeY = node.y || node.end?.y || 0;

        const branch = this.game.tree.branches.find(b =>
            Math.abs(b.end.x - nodeX) < 5 &&
            Math.abs(b.end.y - nodeY) < 5
        );

        if (!branch) {
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const distance = 15 + Math.random() * 10;
                const leafX = nodeX + Math.cos(angle) * distance;
                const leafY = nodeY + Math.sin(angle) * distance;

                const targetSize = 8 + Math.random() * 4;
                this.game.tree.leaves.push({
                    x: leafX,
                    y: leafY,
                    size: targetSize,
                    targetSize,
                    growthProgress: 0,
                    sway: Math.random() * Math.PI * 2,
                    angle: Math.random() * Math.PI * 2,
                    branch: null
                });
            }
            return;
        }

        for (let i = 0; i < count; i++) {
            const t = (i + 1) / (count + 1);
            const leafX = branch.start.x + (branch.end.x - branch.start.x) * t;
            const leafY = branch.start.y + (branch.end.y - branch.start.y) * t;

            const offsetX = (Math.random() - 0.5) * 6;
            const offsetY = (Math.random() - 0.5) * 6;

            const targetSize = 8 + Math.random() * 8;
            this.game.tree.leaves.push({
                x: leafX + offsetX,
                y: leafY + offsetY,
                size: targetSize,
                targetSize,
                growthProgress: 0,
                angle: Math.random() * Math.PI * 2,
                sway: Math.random() * Math.PI * 2,
                branch,
                t,
                offsetX,
                offsetY
            });
        }
    }

    triggerFirstGrowth() {
        const trunkNode = { x: this.game.tree.x, y: this.game.tree.y - this.game.tree.trunkHeight };
        console.log('Triggering first growth, search results:', this.game.searchManager.getInitialResults());
        this.growBranchesFromNode(trunkNode);
        this.game.updateStatus('Tree ready! Use growth tool to grow branches, cut tool to prune them.');
    }

    resetTree() {
        if (!this.game.tree) {
            return;
        }

        this.game.tree.branches = [];
        this.game.tree.leaves = [];
        this.game.tree.fruits = [];
        this.game.tree.flowers = [];
        this.game.tree.x = this.game.width / 2;
        this.game.tree.y = (this.game.initialHeight || this.game.height) - 40;
        if (this.game.fallingFruits) {
            this.game.fallingFruits = [];
        }
    }

    animateFruitHarvest(fruit) {
        if (!fruit) {
            return;
        }

        this.game.tree.fruits = this.game.tree.fruits.filter(existing => existing !== fruit);

        if (!this.game.fallingFruits) {
            this.game.fallingFruits = [];
        }

        this.game.fallingFruits.push({
            x: fruit.x,
            y: fruit.y,
            type: fruit.type,
            size: fruit.size,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -0.5 - Math.random() * 0.8,
            gravity: 0.18 + Math.random() * 0.05,
            rotation: 0,
            spinSpeed: (Math.random() - 0.5) * 0.15,
            bounceCount: 0,
            landed: false,
            fade: 0
        });
    }

    assignBranchId(branch) {
        if (!branch) {
            return null;
        }
        if (!branch.id) {
            if (!this.game.branchIdCounter) {
                this.game.branchIdCounter = 1;
            }
            branch.id = `branch_${this.game.branchIdCounter++}`;
        }
        return branch.id;
    }

    assignIdsToBranches(branches) {
        if (!Array.isArray(branches)) {
            return;
        }
        branches.forEach(branch => this.assignBranchId(branch));
    }
};
