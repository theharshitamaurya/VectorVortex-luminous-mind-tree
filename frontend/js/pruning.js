/**
 * Pruning System - Handles branch cutting and leaf cleanup
 */
class PruningSystem {
    constructor(game) {
        this.game = game;
    }
    
    performPruning() {
        if (!this.game.dragStart || !this.game.dragEnd) return;

        const lineStart = {
            x: this.game.dragStart.x - this.game.cameraOffset.x,
            y: this.game.dragStart.y - this.game.cameraOffset.y
        };
        const lineEnd = {
            x: this.game.dragEnd.x - this.game.cameraOffset.x,
            y: this.game.dragEnd.y - this.game.cameraOffset.y
        };
        
        const cutLength = Math.sqrt(
            Math.pow(lineEnd.x - lineStart.x, 2) + 
            Math.pow(lineEnd.y - lineStart.y, 2)
        );
        
        if (cutLength < 10) {
            console.log('Cut too small, ignoring');
            return;
        }
        
        const directlyCutBranches = this.game.tree.branches.filter(branch => {
            if (branch.length < branch.maxLength) {
                return false;
            }
            return this.lineIntersectsBranch(lineStart, lineEnd, branch);
        });
        
        const disconnectedBranches = this.findDisconnectedBranchesAfterCut(directlyCutBranches);
        const branchesToRemove = [...directlyCutBranches, ...disconnectedBranches];
        
        this.game.tree.branches = this.game.tree.branches.filter(branch => {
            return !branchesToRemove.includes(branch);
        });
        
        if (branchesToRemove.length > 0) {
            this.removeLeavesFromRemovedBranches(branchesToRemove);
            this.removeFlashcardsFromRemovedBranches(branchesToRemove);
            console.log(`Pruned ${branchesToRemove.length} branches (${directlyCutBranches.length} directly cut, ${disconnectedBranches.length} disconnected)`);
            this.game.updateStatus(`Pruned ${branchesToRemove.length} branches!`);
        }
    }
    
    lineIntersectsBranch(lineStart, lineEnd, branch) {
        return this.lineSegmentsIntersect(
            lineStart.x, lineStart.y, lineEnd.x, lineEnd.y,
            branch.start.x, branch.start.y, branch.end.x, branch.end.y
        );
    }
    
    lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return false;
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        return t >= 0.1 && t <= 0.9 && u >= 0.1 && u <= 0.9;
    }
    
    findDisconnectedBranchesAfterCut(cutBranches) {
        const cutEndpoints = new Set();
        cutBranches.forEach(branch => {
            cutEndpoints.add(`${branch.start.x},${branch.start.y}`);
            cutEndpoints.add(`${branch.end.x},${branch.end.y}`);
        });
        
        const connectedBranches = new Set();
        const trunkPoint = { x: this.game.tree.x, y: this.game.tree.y - this.game.tree.trunkHeight };
        
        this.findConnectedBranchesAfterCut(trunkPoint, connectedBranches, cutBranches);
        
        const disconnectedBranches = this.game.tree.branches.filter(branch => {
            if (cutBranches.includes(branch)) return false;
            
            const branchId = `${branch.start.x},${branch.start.y},${branch.end.x},${branch.end.y}`;
            return !connectedBranches.has(branchId);
        });
        
        return disconnectedBranches;
    }
    
    findConnectedBranchesAfterCut(startPoint, connectedBranches, cutBranches) {
        const branchesFromPoint = this.game.tree.branches.filter(branch => {
            return !cutBranches.includes(branch) &&
                   Math.abs(branch.start.x - startPoint.x) < 5 && 
                   Math.abs(branch.start.y - startPoint.y) < 5;
        });
        
        branchesFromPoint.forEach(branch => {
            const branchId = `${branch.start.x},${branch.start.y},${branch.end.x},${branch.end.y}`;
            if (!connectedBranches.has(branchId)) {
                connectedBranches.add(branchId);
                this.findConnectedBranchesAfterCut(branch.end, connectedBranches, cutBranches);
            }
        });
    }
    
    removeLeavesFromRemovedBranches(removedBranches) {
        const initialLeafCount = this.game.tree.leaves.length;
        const initialFruitCount = this.game.tree.fruits.length;
        const initialFlowerCount = this.game.tree.flowers.length;
        
        // Create a set of removed branches for quick lookup
        const removedBranchSet = new Set(removedBranches);
        
        // Filter out leaves that belong to removed branches
        this.game.tree.leaves = this.game.tree.leaves.filter(leaf => {
            // Check if the leaf's branch is in the removed branches set
            const shouldKeep = !removedBranchSet.has(leaf.branch);
            if (!shouldKeep) {
                console.log('Removing leaf from pruned branch:', leaf);
            }
            return shouldKeep;
        });
        
        // Filter out fruits that belong to removed branches
        this.game.tree.fruits = this.game.tree.fruits.filter(fruit => {
            // Check if the fruit's branch is in the removed branches set
            return !removedBranchSet.has(fruit.branch);
        });
        
        // Filter out flowers that belong to removed branches
        this.game.tree.flowers = this.game.tree.flowers.filter(flower => {
            // Check if the flower's branch is in the removed branches set
            return !removedBranchSet.has(flower.branch);
        });
        
        const removedLeafCount = initialLeafCount - this.game.tree.leaves.length;
        const removedFruitCount = initialFruitCount - this.game.tree.fruits.length;
        const removedFlowerCount = initialFlowerCount - this.game.tree.flowers.length;
        
        if (removedLeafCount > 0 || removedFruitCount > 0 || removedFlowerCount > 0) {
            console.log(`Removed ${removedLeafCount} leaves, ${removedFruitCount} fruits, and ${removedFlowerCount} flowers from pruned branches`);
        }
    }
    
    removeFlashcardsFromRemovedBranches(removedBranches) {
        if (!this.game.flashcardManager) {
            return;
        }

        const removedCount = this.game.flashcardManager.removeFlashcardsFromBranches(removedBranches);

        if (removedCount > 0) {
            console.log(`Removed ${removedCount} flashcards from pruned branches`);
        }

        if (this.game.quizManager) {
            const removedQuizzes = this.game.quizManager.removeQuizzesFromBranches(removedBranches);
            if (removedQuizzes > 0) {
                console.log(`Removed ${removedQuizzes} quizzes from pruned branches`);
            }
        }
    }
    
    distanceFromPointToLineSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            return Math.sqrt(A * A + B * B);
        }
        
        let param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
