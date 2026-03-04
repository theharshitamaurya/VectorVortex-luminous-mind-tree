from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from perplexity import Perplexity
from dotenv import load_dotenv
from sqlalchemy.orm import Session
import logging
import os
import json
from datetime import datetime, timezone
from typing import Optional

load_dotenv()
app = FastAPI()
logger = logging.getLogger(__name__)


def _db_unavailable_error() -> HTTPException:
    return HTTPException(status_code=503, detail="Saving and loading are temporarily disabled.")

DB_AVAILABLE = False
SessionLocal = None  # Will be set if database initializes successfully

try:
    from models import (
        create_tables, get_db, GameSession, SearchResult, Branch, 
        Leaf, Flashcard, Fruit, Flower, SessionLocal as ModelSessionLocal
    )

    create_tables()
    DB_AVAILABLE = True
    SessionLocal = ModelSessionLocal
    logger.info("Database initialized successfully.")
except Exception as exc:
    logger.error("Database initialization failed: %s", exc)

    def get_db():  # type: ignore
        raise _db_unavailable_error()


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Mount frontend
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
async def serve_game():
    return FileResponse(os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html"))

class SearchRequest(BaseModel):
    query: str

class WebSearchRequest(BaseModel):
    query: str
    count: int = 5
    negative_prompts: list = []  # List of existing search results to exclude

class SaveGameStateRequest(BaseModel):
    original_search_query: str
    search_results: list
    branches: list
    leaves: list
    fruits: list
    flowers: list
    flashcards: list = []
    camera_offset: dict = {"x": 0.0, "y": 0.0}

class LoadGameStateRequest(BaseModel):
    session_id: int

class CreateFlashcardsRequest(BaseModel):
    branch_id: Optional[int] = None
    count: int = 5
    search_result: Optional[dict] = None  # For frontend data
    node_position: Optional[dict] = None  # Node position for linking back to tree

class DeleteGameStateRequest(BaseModel):
    session_id: int

class GenerateQuizRequest(BaseModel):
    flashcards: list

@app.post("/api/search")
async def search(request: SearchRequest):
    try:
        client = Perplexity()
        
        # Define the JSON schema for structured output
        schema = {
            "type": "object",
            "properties": {
                "areas": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "search_query": {"type": "string"}
                        },
                        "required": ["name", "description", "search_query"]
                    },
                    "minItems": 5,
                    "maxItems": 5
                }
            },
            "required": ["areas"]
        }
        
        # Use structured outputs to get exactly 5 areas with descriptions
        completion = client.chat.completions.create(
            model="sonar-pro",
            messages=[
                {"role": "user", "content": f"What are the primary 5 areas in {request.query}? Please provide exactly 5 distinct areas, each with a brief description and a relevant search query for further research. Return the data as a JSON object with the following structure: areas array with 5 objects, each containing name, description, and search_query fields."}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"schema": schema}
            }
        )
        
        # Parse the structured JSON response
        response_content = completion.choices[0].message.content
        try:
            structured_data = json.loads(response_content)
        except json.JSONDecodeError as e:
            # Fallback to generic results
            structured_data = None
        
        # Create results from structured data
        results = []
        if structured_data and "areas" in structured_data:
            for i, area in enumerate(structured_data["areas"]):
                results.append({
                    "id": i,
                    "title": area["name"],
                    "url": f"https://example.com/{request.query.replace(' ', '-')}-{area['name'].lower().replace(' ', '-').replace('(', '').replace(')', '')}",
                    "date": "2024-01-01",
                    "snippet": area["description"],
                    "llm_content": f"**{area['name']}**\n\n{area['description']}"
                })
        else:
            # Fallback to generic results
            for i in range(5):
                results.append({
                    "id": i,
                    "title": f"{request.query} - Area {i+1}",
                    "url": f"https://example.com/{request.query.replace(' ', '-')}-area-{i+1}",
                    "date": "2024-01-01",
                    "snippet": f"Primary area {i+1} in {request.query}",
                    "llm_content": response_content
                })
        
        return {"query": request.query, "results": results, "structured_data": structured_data}
    except Exception as e:
        return {"error": str(e), "query": request.query}

@app.post("/api/web-search")
def web_search(request: WebSearchRequest):
    try:
        client = Perplexity()

        # Construct query with negative prompts if provided
        query = request.query
        if request.negative_prompts:
            # Add negative prompts to exclude existing results
            negative_terms = ", ".join([f'"{prompt}"' for prompt in request.negative_prompts])
            query = f"{request.query} -{negative_terms}"

        # Use basic search that works (images not supported in this SDK version)
        search = client.search.create(
            query=query,
            max_results=request.count,
            max_tokens_per_page=1024
        )
        
        # Format results to match the expected structure
        results = []
        for i, result in enumerate(search.results):
            results.append({
                "id": i,
                "title": result.title,
                "url": result.url,
                "date": "2024-01-01",  # Perplexity search doesn't provide dates
                "snippet": result.snippet if hasattr(result, 'snippet') else "No description available",
                "llm_content": result.snippet if hasattr(result, 'snippet') else "No description available",
                "images": []  # Images not supported in this SDK version
            })
        
        return {"query": request.query, "results": results}
    except Exception as e:
        return {"error": str(e), "query": request.query}

@app.post("/api/save-game-state")
async def save_game_state(request: SaveGameStateRequest, db: Session = Depends(get_db)):
    if not DB_AVAILABLE:
        raise _db_unavailable_error()
    try:
        # Create new game session
        game_session = GameSession(
            original_search_query=request.original_search_query,
            camera_offset_x=request.camera_offset.get("x", 0.0) if request.camera_offset else 0.0,
            camera_offset_y=request.camera_offset.get("y", 0.0) if request.camera_offset else 0.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(game_session)
        db.flush()  # Get the ID
        
        # Save search results
        search_result_objects = []
        for result in request.search_results:
            search_result = SearchResult(
                game_session_id=game_session.id,
                title=result.get("title", ""),
                url=result.get("url", ""),
                snippet=result.get("snippet", ""),
                llm_content=result.get("llm_content", ""),
                search_query=result.get("search_query", ""),
                created_at=datetime.now(timezone.utc)
            )
            db.add(search_result)
            search_result_objects.append(search_result)
        
        db.flush()  # Get search result IDs
        
        # Save branches with hierarchy tracking
        branch_objects = []
        for i, branch_data in enumerate(request.branches):
            search_result_id = None
            
            # Check if branch has its own search result data
            if branch_data.get("searchResult"):
                # Create a new search result for this branch
                branch_search_result = SearchResult(
                    game_session_id=game_session.id,
                    title=branch_data["searchResult"].get("title", ""),
                    url=branch_data["searchResult"].get("url", ""),
                    snippet=branch_data["searchResult"].get("snippet", ""),
                    llm_content=branch_data["searchResult"].get("llm_content", ""),
                    search_query=branch_data["searchResult"].get("search_query", ""),
                    created_at=datetime.now(timezone.utc)
                )
                db.add(branch_search_result)
                db.flush()  # Get the ID
                search_result_id = branch_search_result.id
            elif i < len(search_result_objects):
                # Fallback to index-based matching for initial branches
                search_result_id = search_result_objects[i].id
            else:
                search_result_id = None
            
            branch = Branch(
                game_session_id=game_session.id,
                search_result_id=search_result_id,
                parent_branch_id=branch_data.get("parentBranchId"),  # Track parent
                start_x=branch_data.get("start", {}).get("x", 0),
                start_y=branch_data.get("start", {}).get("y", 0),
                end_x=branch_data.get("end", {}).get("x", 0),
                end_y=branch_data.get("end", {}).get("y", 0),
                length=branch_data.get("length", 0),
                max_length=branch_data.get("maxLength", 0),
                angle=branch_data.get("angle", 0),
                thickness=branch_data.get("thickness", 1),
                generation=branch_data.get("generation", 0),
                is_growing=branch_data.get("isGrowing", False),
                growth_speed=branch_data.get("growthSpeed", 1.0),
                node_type=branch_data.get("nodeType", "branch"),
                created_at=datetime.now(timezone.utc)
            )
            db.add(branch)
            branch_objects.append(branch)
        
        db.flush()  # Get branch IDs
        
        # Save leaves
        for leaf_data in request.leaves:
            leaf = Leaf(
                game_session_id=game_session.id,
                branch_id=leaf_data.get("branchId"),  # Can be None now
                x=leaf_data.get("x", 0),
                y=leaf_data.get("y", 0),
                size=leaf_data.get("size", 1.0),
                created_at=datetime.now(timezone.utc)
            )
            db.add(leaf)
        
        # Save fruits
        for fruit_data in request.fruits:
            fruit = Fruit(
                game_session_id=game_session.id,
                x=fruit_data.get("x", 0),
                y=fruit_data.get("y", 0),
                type=fruit_data.get("type", "apple"),
                size=fruit_data.get("size", 1.0),
                created_at=datetime.now(timezone.utc)
            )
            db.add(fruit)
        
        # Save flowers
        for flower_data in request.flowers:
            flower = Flower(
                game_session_id=game_session.id,
                x=flower_data.get("x", 0),
                y=flower_data.get("y", 0),
                type=flower_data.get("type", "🌸"),
                size=flower_data.get("size", 1.0),
                created_at=datetime.now(timezone.utc)
            )
            db.add(flower)
        
        # Save flashcards
        for flashcard_data in request.flashcards:
            # Extract node position if available
            node_position = flashcard_data.get("node_position", {})
            flashcard = Flashcard(
                game_session_id=game_session.id,
                branch_id=flashcard_data.get("branch_id"),
                front=flashcard_data.get("front", ""),
                back=flashcard_data.get("back", ""),
                difficulty=flashcard_data.get("difficulty", "medium"),
                category=flashcard_data.get("category", ""),
                node_position_x=node_position.get("x"),
                node_position_y=node_position.get("y"),
                created_at=datetime.now(timezone.utc)
            )
            db.add(flashcard)
        
        db.commit()
        
        return {
            "success": True,
            "session_id": game_session.id,
            "message": "Game state saved successfully"
        }
        
    except Exception as e:
        db.rollback()
        return {"error": str(e), "success": False}

@app.post("/api/load-game-state")
async def load_game_state(request: LoadGameStateRequest, db: Session = Depends(get_db)):
    if not DB_AVAILABLE:
        raise _db_unavailable_error()
    try:
        # Get game session
        game_session = db.query(GameSession).filter(GameSession.id == request.session_id).first()
        if not game_session:
            raise HTTPException(status_code=404, detail="Game session not found")
        
        # Get all related data
        search_results = db.query(SearchResult).filter(SearchResult.game_session_id == request.session_id).all()
        branches = db.query(Branch).filter(Branch.game_session_id == request.session_id).all()
        leaves = db.query(Leaf).filter(Leaf.game_session_id == request.session_id).all()
        flashcards = db.query(Flashcard).filter(Flashcard.game_session_id == request.session_id).all()
        fruits = db.query(Fruit).filter(Fruit.game_session_id == request.session_id).all()
        flowers = db.query(Flower).filter(Flower.game_session_id == request.session_id).all()
        
        # Convert to dictionaries
        search_results_data = []
        for result in search_results:
            search_results_data.append({
                "id": result.id,
                "title": result.title,
                "url": result.url,
                "snippet": result.snippet,
                "llm_content": result.llm_content,
                "search_query": result.search_query
            })
        
        branches_data = []
        for branch in branches:
            branches_data.append({
                "id": branch.id,
                "start": {"x": branch.start_x, "y": branch.start_y},
                "end": {"x": branch.end_x, "y": branch.end_y},
                "length": branch.length,
                "maxLength": branch.max_length,
                "angle": branch.angle,
                "thickness": branch.thickness,
                "generation": branch.generation,
                "isGrowing": branch.is_growing,
                "growthSpeed": branch.growth_speed,
                "nodeType": branch.node_type,
                "parentBranchId": branch.parent_branch_id,
                "searchResult": {
                    "id": branch.search_result.id if branch.search_result else None,
                    "title": branch.search_result.title if branch.search_result else None,
                    "url": branch.search_result.url if branch.search_result else None,
                    "snippet": branch.search_result.snippet if branch.search_result else None,
                    "llm_content": branch.search_result.llm_content if branch.search_result else None
                } if branch.search_result else None
            })
        
        leaves_data = []
        for leaf in leaves:
            leaves_data.append({
                "id": leaf.id,
                "x": leaf.x,
                "y": leaf.y,
                "size": leaf.size,
                "branchId": leaf.branch_id
            })
        
        fruits_data = []
        for fruit in fruits:
            fruits_data.append({
                "id": fruit.id,
                "x": fruit.x,
                "y": fruit.y,
                "type": fruit.type,
                "size": fruit.size
            })
        
        flowers_data = []
        for flower in flowers:
            flowers_data.append({
                "id": flower.id,
                "x": flower.x,
                "y": flower.y,
                "type": flower.type,
                "size": flower.size
            })
        
        flashcards_data = []
        for flashcard in flashcards:
            flashcards_data.append({
                "id": flashcard.id,
                "branch_id": flashcard.branch_id,
                "front": flashcard.front,
                "back": flashcard.back,
                "difficulty": flashcard.difficulty,
                "category": flashcard.category,
                "node_position": {
                    "x": flashcard.node_position_x,
                    "y": flashcard.node_position_y
                } if flashcard.node_position_x is not None and flashcard.node_position_y is not None else None,
                "created_at": flashcard.created_at.isoformat(),
                "last_reviewed": flashcard.last_reviewed.isoformat() if flashcard.last_reviewed else None,
                "review_count": flashcard.review_count
            })
        
        return {
            "success": True,
            "game_state": {
                "original_search_query": game_session.original_search_query,
                "search_results": search_results_data,
                "branches": branches_data,
                "leaves": leaves_data,
                "flashcards": flashcards_data,
                "fruits": fruits_data,
                "flowers": flowers_data,
                "camera_offset": {"x": game_session.camera_offset_x, "y": game_session.camera_offset_y},
                "created_at": game_session.created_at.isoformat(),
                "updated_at": game_session.updated_at.isoformat()
            }
        }
        
    except Exception as e:
        return {"error": str(e), "success": False}

@app.get("/api/game-sessions")
async def get_game_sessions(db: Session = Depends(get_db)):
    if not DB_AVAILABLE:
        raise _db_unavailable_error()
    try:
        sessions = db.query(GameSession).order_by(GameSession.updated_at.desc()).all()
        sessions_data = []
        for session in sessions:
            sessions_data.append({
                "id": session.id,
                "original_search_query": session.original_search_query,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat()
            })
        return {"success": True, "sessions": sessions_data}
    except Exception as e:
        return {"error": str(e), "success": False}

# Removed extra endpoint - using existing /api/create-flashcards endpoint

@app.post("/api/create-flashcards")
async def create_flashcards(request: CreateFlashcardsRequest):
    db_session: Optional[Session] = None
    branch = None
    try:
        # Handle both database branches and frontend data
        if request.branch_id:
            if not DB_AVAILABLE or SessionLocal is None:
                raise _db_unavailable_error()
            
            db_session = SessionLocal()
            # Database branch approach
            branch = db_session.query(Branch).filter(Branch.id == request.branch_id).first()
            if not branch:
                raise HTTPException(status_code=404, detail="Branch not found")
            
            if not branch.search_result:
                raise HTTPException(status_code=400, detail="Branch has no search result data")
            
            search_result_data = {
                "title": branch.search_result.title,
                "llm_content": branch.search_result.llm_content,
                "snippet": branch.search_result.snippet
            }
        elif request.search_result:
            # Frontend data approach
            search_result_data = request.search_result
        else:
            raise HTTPException(status_code=400, detail="Either branch_id or search_result must be provided")
        
        # Use Perplexity to generate flashcards from the search result content
        client = Perplexity()
        
        # Create a prompt to generate flashcards
        flashcard_prompt = f"""
        Based on the following content about "{search_result_data.get('title', 'Unknown Topic')}", create exactly {request.count} flashcards.
        Each flashcard should have a clear question on the front and a detailed, well-written answer on the back.
        Vary the answer length appropriately - simple concepts can have shorter answers (100-150 chars), while complex topics may need longer explanations (200-400 chars).
        
        IMPORTANT: Use normal sentence casing:
        - Capitalize only the first letter of each sentence
        - Capitalize proper nouns (names, places, organizations, etc.)
        - Use lowercase for common nouns and adjectives
        - Do NOT use all capital letters
        - End sentences with proper punctuation
        - Write in complete, grammatically correct sentences
        
        Focus on key concepts, definitions, and important facts.
        
        Content: {search_result_data.get('llm_content', search_result_data.get('snippet', ''))}
        
        Return the flashcards as a JSON array with this structure:
        [
            {{
                "front": "Question or term",
                "back": "Properly capitalized answer with correct grammar",
                "difficulty": "easy|medium|hard"
            }}
        ]
        """
        
        # Define JSON schema for structured output
        schema = {
            "type": "object",
            "properties": {
                "flashcards": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "front": {"type": "string"},
                            "back": {"type": "string"},
                            "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]}
                        },
                        "required": ["front", "back", "difficulty"]
                    },
                    "minItems": request.count,
                    "maxItems": request.count
                }
            },
            "required": ["flashcards"]
        }
        
        completion = client.chat.completions.create(
            model="sonar-pro",
            messages=[
                {"role": "user", "content": flashcard_prompt}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"schema": schema}
            }
        )
        
        # Parse the structured JSON response
        response_content = completion.choices[0].message.content
        try:
            structured_data = json.loads(response_content)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=500, detail="Failed to parse flashcard data")
        
        # Create flashcards
        created_flashcards = []
        for flashcard_data in structured_data.get("flashcards", []):
            if request.branch_id:
                # Save to database for database branches
                flashcard = Flashcard(
                    game_session_id=branch.game_session_id,
                    branch_id=branch.id,
                    front=flashcard_data["front"],
                    back=flashcard_data["back"],
                    difficulty=flashcard_data["difficulty"],
                    category=branch.search_result.title,
                    created_at=datetime.now(timezone.utc)
                )
                db_session.add(flashcard)
                created_flashcards.append({
                    "id": flashcard.id,
                    "front": flashcard.front,
                    "back": flashcard.back,
                    "difficulty": flashcard.difficulty,
                    "category": flashcard.category
                })
            else:
                # Return data for frontend (not saved to database yet)
                # Use search result title for categorization (individual topic, not root topic)
                category = search_result_data.get('title', 'Unknown Topic')
                created_flashcards.append({
                    "front": flashcard_data["front"],
                    "back": flashcard_data["back"],
                    "difficulty": flashcard_data["difficulty"],
                    "category": category,
                    "node_position": request.node_position  # Include node position for linking
                })
        
        if request.branch_id and db_session:
            db_session.commit()
        
        return {
            "success": True,
            "flashcards": created_flashcards,
            "message": f"Created {len(created_flashcards)} flashcards for {search_result_data.get('title', 'Unknown Topic')}"
        }
        
    except HTTPException as exc:
        if db_session:
            db_session.rollback()
        raise exc
    except Exception as e:
        if db_session:
            db_session.rollback()
        return {"error": str(e), "success": False}
    finally:
        if db_session:
            db_session.close()

@app.get("/api/flashcards/{branch_id}")
async def get_flashcards(branch_id: int, db: Session = Depends(get_db)):
    try:
        flashcards = db.query(Flashcard).filter(Flashcard.branch_id == branch_id).all()
        
        flashcards_data = []
        for flashcard in flashcards:
            flashcards_data.append({
                "id": flashcard.id,
                "front": flashcard.front,
                "back": flashcard.back,
                "difficulty": flashcard.difficulty,
                "category": flashcard.category,
                "created_at": flashcard.created_at.isoformat(),
                "last_reviewed": flashcard.last_reviewed.isoformat() if flashcard.last_reviewed else None,
                "review_count": flashcard.review_count
            })
        
        return {
            "success": True,
            "flashcards": flashcards_data
        }
        
    except Exception as e:
        return {"error": str(e), "success": False}

@app.post("/api/delete-game-state")
async def delete_game_state(request: DeleteGameStateRequest, db: Session = Depends(get_db)):
    if not DB_AVAILABLE:
        raise _db_unavailable_error()
    try:
        # Get the game session
        game_session = db.query(GameSession).filter(GameSession.id == request.session_id).first()
        if not game_session:
            raise HTTPException(status_code=404, detail="Game session not found")
        
        # Delete the game session (cascade will handle related records)
        db.delete(game_session)
        db.commit()
        
        return {
            "success": True,
            "message": f"Game session {request.session_id} deleted successfully"
        }
        
    except Exception as e:
        db.rollback()
        return {"error": str(e), "success": False}

@app.post("/api/generate-quiz")
async def generate_quiz(request: GenerateQuizRequest):
    try:
        client = Perplexity()
        
        # Create a prompt to generate quiz questions from flashcards
        flashcard_data = "\n".join([f"Q: {card.get('front', '')}\nA: {card.get('back', '')}" for card in request.flashcards])
        
        quiz_prompt = f"""
        Based on these flashcards, create 5 challenging multiple choice quiz questions that test understanding rather than memorization.
        
        Flashcards:
        {flashcard_data}
        
        For each question:
        - Create a NEW question that tests understanding of the concepts, not just the exact flashcard content
        - Make the correct answer shorter and more concise (50-100 characters)
        - Create 3 plausible but incorrect alternatives that are also short and concise
        - Make the questions challenging but fair
        - Use normal sentence casing (not all caps)
        
        Return as JSON array with this structure:
        [
            {{
                "question": "New challenging question",
                "correctAnswer": "Short correct answer",
                "options": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"]
            }}
        ]
        """
        
        # Define JSON schema for structured output
        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"},
                            "correctAnswer": {"type": "string"},
                            "options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 4,
                                "maxItems": 4
                            }
                        },
                        "required": ["question", "correctAnswer", "options"]
                    },
                    "minItems": 5,
                    "maxItems": 5
                }
            },
            "required": ["questions"]
        }
        
        completion = client.chat.completions.create(
            model="sonar-pro",
            messages=[
                {"role": "user", "content": quiz_prompt}
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"schema": schema}
            }
        )
        
        # Parse the structured JSON response
        response_content = completion.choices[0].message.content
        try:
            structured_data = json.loads(response_content)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=500, detail="Failed to parse quiz data")
        
        # Shuffle options for each question
        questions = []
        for question_data in structured_data.get("questions", []):
            options = question_data["options"]
            # Shuffle the options
            import random
            random.shuffle(options)
            questions.append({
                "question": question_data["question"],
                "correctAnswer": question_data["correctAnswer"],
                "options": options
            })
        
        return {
            "success": True,
            "questions": questions
        }
        
    except Exception as e:
        return {"error": str(e), "success": False}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
