# perplexitree - AI-Powered Knowledge Tree Game

- Live at: https://perplexitree.app/
- Live demo: https://www.youtube.com/watch?v=P5U9jo97fCk

A beautiful, interactive web game that combines the meditative puzzle mechanics of "Prune" with AI-powered knowledge exploration. Players grow knowledge trees by pruning branches while leveraging the Perplexity API to discover unique, real-time information on any topic. Each growth session returns fresh, non-redundant search results to build comprehensive understanding.

## Project Summary

**Purpose**: perplexitree transforms learning into an engaging, visual experience where users cultivate knowledge trees through strategic pruning and AI-enhanced exploration. The game addresses information overload by presenting unique, curated insights through an intuitive tree metaphor.

**Technical Approach**: Built with a modular architecture featuring FastAPI backend and vanilla JavaScript frontend, the application integrates Perplexity's real-time search capabilities to generate unique knowledge areas for each growth session. The system ensures non-redundant information retrieval through intelligent query generation and structured output parsing.

**Perplexity API Integration**: The game leverages Perplexity's reasoning and retrieval capabilities through a two-phase approach:
- **Initial Search**: Uses Perplexity's `sonar-pro` chat completion model with structured JSON output to generate 5 unique knowledge areas from the initial query
- **Subsequent Growth**: Uses Perplexity's search model with negative prompting to find unique web results for each new branch
- **Flashcard Generation**: Uses `sonar-pro` chat completion to create study materials from search results
- **Unique Results**: Negative prompting system ensures each growth session returns fresh, non-redundant information

The integration ensures players receive diverse, comprehensive information while maintaining the game's meditative, focused learning experience.

## Features

- **AI-Powered Knowledge Tree**: Grow branches that represent real search results from Perplexity API
- **Interactive Tools**: 7 different tools for managing your knowledge tree
- **Unique Search Results**: Each growth session returns fresh, non-redundant information
- **Study System**: Create flashcards from search results for enhanced learning
- **Visual Progression**: Transform knowledge into flowers and fruits
- **Game State Persistence**: Save and load your knowledge trees

## Game Mechanics

### Tools Available
1. **Growth Tool**: Click on nodes to grow new branches with search results
2. **Cut Tool**: Click and drag to prune unwanted branches
3. **Leaves Tool**: Create flashcards from search results on branches
4. **Flower Tool**: Add flowers to branch ends (knowledge blossoming)
5. **Fruit Tool**: Transform flowers into apples (fruit of labor)
6. **Reposition Tool**: Drag branch ends to move and resize branches
7. **Study Tool**: Hover over nodes to view search result details
8. **Pan Tool**: Drag to move around the view

### Core Gameplay
1. **Start**: Enter a search query to begin growing your knowledge tree
2. **Grow**: Use the growth tool to expand branches with AI-powered search results
3. **Prune**: Cut away branches that don't contribute to your learning goals
4. **Study**: Create flashcards and study materials from your search results
5. **Progress**: Watch your knowledge tree evolve with flowers and fruits

## Installation & Setup

### Prerequisites
- Python 3.8+
- Virtual environment (recommended)

### Quick Start

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
python main.py
```

5. Open your browser and go to: `http://localhost:8001`

### Environment Variables
Create a `.env` file in the `backend/` directory:
```
PERPLEXITY_API_KEY=your_perplexity_api_key_here
```
## Technical Implementation

### Architecture
- **Backend**: FastAPI server with SQLite database
- **Frontend**: Vanilla JavaScript with HTML5 Canvas rendering
- **AI Integration**: Perplexity API for real-time knowledge generation

### Key API Endpoints

**`POST /api/search`** - Initial Knowledge Tree Creation
- Uses Perplexity `sonar-pro` with structured JSON output
- Generates exactly 5 unique knowledge areas from user query

**`POST /api/web-search`** - Branch Growth with Negative Prompting
- **Key Feature**: Uses negative prompting to exclude existing results
- Ensures each growth session returns fresh, non-redundant information
- Constructs queries like: `"machine learning -"existing result 1" -"existing result 2"`

**`POST /api/save-game-state`** - Public Game Storage
- Saves complete game state (public saves - all games are shareable)
- Stores branches, search results, flashcards, and visual elements

**`POST /api/create-flashcards`** - AI Study Material Generation
- Uses Perplexity to create flashcards from search content
- Links flashcards to specific tree nodes with difficulty ratings

### Perplexity API Integration

#### Two-Phase Approach
1. **Initial Search**: `sonar-pro` chat completion for structured knowledge areas
2. **Subsequent Growth**: Search API with negative prompting for unique results

#### Negative Prompting Strategy
- **Purpose**: Prevents redundant information across growth sessions
- **Implementation**: Excludes existing search result titles and snippets
- **Result**: Each branch growth returns fresh, unique content

### Database Design
- **Relational Model**: GameSession → SearchResult → Branch hierarchy
- **Public Access**: All saved games are publicly accessible
- **Cascade Deletion**: Automatic cleanup when sessions are deleted

### Key Technologies
**Backend**: FastAPI, SQLAlchemy, Perplexity API  
**Frontend**: HTML5 Canvas, Vanilla JavaScript  
**Database**: SQLite with relational modeling

## License

Created for Perplexity Hackathon. Tree growth/prune mechanic inspired by Prune game by Joel McDonald.
"# VectorVortex-luminous-mind-tree" 
