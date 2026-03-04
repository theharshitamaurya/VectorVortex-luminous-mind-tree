/**
 * SearchManager centralizes topic discovery and result assignment logic.
 */
class SearchManager {
    constructor(game, apiBaseUrl) {
        this.game = game;
        this.apiBaseUrl = apiBaseUrl;
        this.reset();
    }

    reset() {
        this.searchResults = [];
        this.originalQuery = null;
        this.usedTitles = new Set();
    }

    getOriginalQuery() {
        return this.originalQuery;
    }

    getInitialResults() {
        return this.searchResults;
    }

    async fetchInitialResults(query) {
        console.log('SearchManager: fetching search results for:', query);
        this.originalQuery = query;

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            console.log('SearchManager: initial search status:', response.status);
            const data = await response.json();
            console.log('SearchManager: initial search payload:', data);

            if (data.results) {
                this.searchResults = data.results;
                if (!this.searchResults.length) {
                    this.searchResults = this.getFallbackResults(query);
                }
                this.game.updateStatus(`Found ${this.searchResults.length} topics! Use study tool to explore.`);
                return this.searchResults;
            }

            // Compatibility with newer API shape ({ nodes: [...] }).
            if (data.nodes) {
                this.searchResults = data.nodes.map((node) => ({
                    title: node.label || 'Untitled Topic',
                    snippet: node.summary || node.text || '',
                    llm_content: node.text || node.summary || '',
                    url: node.sourceUrl || ''
                }));
                if (!this.searchResults.length) {
                    this.searchResults = this.getFallbackResults(query);
                }
                this.game.updateStatus(`Found ${this.searchResults.length} topics! Use study tool to explore.`);
                return this.searchResults;
            }
        } catch (error) {
            console.error('SearchManager: initial search failed', error);
            this.searchResults = this.getFallbackResults(query);
            this.game.updateStatus('Search API unavailable. Started with local topic branches.');
            return this.searchResults;
        }

        this.searchResults = this.getFallbackResults(query);
        this.game.updateStatus('Using local starter topics. You can still grow branches.');
        return this.searchResults;
    }

    assignInitialResults(branches) {
        if (!branches || branches.length === 0) {
            return;
        }

        if (!this.searchResults || this.searchResults.length === 0) {
            console.log('SearchManager: no initial results available to assign.');
            return;
        }

        branches.forEach((branch, index) => {
            const result = this.searchResults[index];
            if (!result) {
                return;
            }

            const sanitized = { ...result };
            delete sanitized.url;
            branch.searchResult = sanitized;

            const title = sanitized.title?.toLowerCase();
            if (title) {
                this.usedTitles.add(title);
            }

            console.log(`SearchManager: assigned initial result ${index} to branch:`, sanitized.title);
        });
    }

    async assignResultsToBranches(parentNode, newBranches) {
        if (!newBranches || newBranches.length === 0) {
            return;
        }

        const searchTopic = parentNode?.searchResult?.title || this.originalQuery;

        if (!searchTopic) {
            console.log('SearchManager: no search topic available for branch expansion.');
            return;
        }

        const researchQuery = `deep research on ${searchTopic} in the context of ${this.originalQuery}`;
        console.log(`SearchManager: fetching child results with query "${researchQuery}" for ${newBranches.length} branches.`);

        try {
            let collected = [];
            let attempts = 0;
            const maxAttempts = 10;

            while (collected.length < newBranches.length && attempts < maxAttempts) {
                const negativePrompts = collected.map(result => result.title);
                const response = await fetch(`${this.apiBaseUrl}/api/web-search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: researchQuery,
                        count: Math.max(5, newBranches.length - collected.length + 2),
                        negative_prompts: negativePrompts
                    })
                });

                const data = await response.json();
                console.log(`SearchManager: attempt ${attempts + 1} results:`, data);

                if (data.results && data.results.length > 0) {
                    const unique = this.filterDuplicateResults(data.results);
                    collected = this.filterDuplicateResults([...collected, ...unique]);
                }

                attempts++;
            }

            console.log('SearchManager: final unique results:', collected);

            newBranches.forEach((branch, index) => {
                if (!collected[index]) {
                    console.warn(`SearchManager: no result available for branch index ${index}`);
                    return;
                }

                branch.searchResult = collected[index];

                const title = collected[index].title?.toLowerCase();
                if (title) {
                    this.usedTitles.add(title);
                }

                console.log(`SearchManager: assigned result to branch ${index}:`, collected[index].title);
            });

            const assignedCount = Math.min(collected.length, newBranches.length);
            if (attempts > 1) {
                this.game.updateStatus(`Found ${assignedCount} unique web search results after ${attempts} attempts with negative prompts!`);
            } else {
                this.game.updateStatus(`Found ${assignedCount} unique web search results for new branches!`);
            }
        } catch (error) {
            console.error('SearchManager: child search failed', error);
            const fallback = this.getFallbackResults(searchTopic);
            newBranches.forEach((branch, index) => {
                if (fallback[index]) {
                    branch.searchResult = fallback[index];
                }
            });
            this.game.updateStatus('Web search unavailable. Added local branch topics.');
        }
    }

    filterDuplicateResults(results) {
        const unique = [];
        const seen = new Set();

        results.forEach(result => {
            const titleLower = result.title?.toLowerCase();
            if (!titleLower) {
                return;
            }

            if (seen.has(titleLower) || this.usedTitles.has(titleLower)) {
                return;
            }

            seen.add(titleLower);
            unique.push(result);
        });

        return unique;
    }

    getFallbackResults(query) {
        const topic = (query || 'your topic').trim();
        return [
            {
                title: `${topic} fundamentals`,
                snippet: `Core definitions, terminology, and principles behind ${topic}.`,
                llm_content: `Core definitions, terminology, and principles behind ${topic}.`
            },
            {
                title: `${topic} practical workflows`,
                snippet: `Step-by-step workflows to apply ${topic} in real projects.`,
                llm_content: `Step-by-step workflows to apply ${topic} in real projects.`
            },
            {
                title: `${topic} tools and ecosystem`,
                snippet: `Major tools, libraries, platforms, and integration patterns for ${topic}.`,
                llm_content: `Major tools, libraries, platforms, and integration patterns for ${topic}.`
            },
            {
                title: `${topic} common mistakes`,
                snippet: `Frequent pitfalls, anti-patterns, and how to avoid them in ${topic}.`,
                llm_content: `Frequent pitfalls, anti-patterns, and how to avoid them in ${topic}.`
            },
            {
                title: `${topic} advanced directions`,
                snippet: `Research, optimization, scaling, and future trends in ${topic}.`,
                llm_content: `Research, optimization, scaling, and future trends in ${topic}.`
            }
        ];
    }
}
