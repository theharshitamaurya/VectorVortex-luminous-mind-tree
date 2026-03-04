from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import json
import os

Base = declarative_base()

class GameSession(Base):
    __tablename__ = "game_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    original_search_query = Column(String, nullable=False)
    camera_offset_x = Column(Float, default=0.0)
    camera_offset_y = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    search_results = relationship("SearchResult", back_populates="game_session", cascade="all, delete-orphan")
    branches = relationship("Branch", back_populates="game_session", cascade="all, delete-orphan")
    leaves = relationship("Leaf", back_populates="game_session", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="game_session", cascade="all, delete-orphan")
    fruits = relationship("Fruit", back_populates="game_session", cascade="all, delete-orphan")
    flowers = relationship("Flower", back_populates="game_session", cascade="all, delete-orphan")

class SearchResult(Base):
    __tablename__ = "search_results"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    title = Column(String, nullable=False)
    url = Column(String)
    snippet = Column(Text)
    llm_content = Column(Text)
    search_query = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    game_session = relationship("GameSession", back_populates="search_results")
    branches = relationship("Branch", back_populates="search_result")

class Branch(Base):
    __tablename__ = "branches"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    search_result_id = Column(Integer, ForeignKey("search_results.id"), nullable=True)
    parent_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)  # For hierarchy
    
    # Branch properties
    start_x = Column(Float, nullable=False)
    start_y = Column(Float, nullable=False)
    end_x = Column(Float, nullable=False)
    end_y = Column(Float, nullable=False)
    length = Column(Float, nullable=False)
    max_length = Column(Float, nullable=False)
    angle = Column(Float, nullable=False)
    thickness = Column(Float, nullable=False)
    generation = Column(Integer, default=0)
    is_growing = Column(Boolean, default=False)
    growth_speed = Column(Float, default=1.0)
    node_type = Column(String, default="branch")  # "trunk", "branch", "end_node"
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    game_session = relationship("GameSession", back_populates="branches")
    search_result = relationship("SearchResult", back_populates="branches")
    leaves = relationship("Leaf", back_populates="branch", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="branch", cascade="all, delete-orphan")
    
    # Self-referential relationship for hierarchy
    parent_branch = relationship("Branch", remote_side=[id], backref="child_branches")

class Leaf(Base):
    __tablename__ = "leaves"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    size = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    game_session = relationship("GameSession", back_populates="leaves")
    branch = relationship("Branch", back_populates="leaves")

class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    
    # Flashcard content
    front = Column(Text, nullable=False)  # Question or term
    back = Column(Text, nullable=False)   # Answer or definition
    difficulty = Column(String, default="medium")  # "easy", "medium", "hard"
    category = Column(String, nullable=True)  # Topic category
    node_position_x = Column(Float, nullable=True)  # X coordinate of source node
    node_position_y = Column(Float, nullable=True)  # Y coordinate of source node
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_reviewed = Column(DateTime, nullable=True)
    review_count = Column(Integer, default=0)
    
    # Relationships
    game_session = relationship("GameSession", back_populates="flashcards")
    branch = relationship("Branch", back_populates="flashcards")

class Fruit(Base):
    __tablename__ = "fruits"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    type = Column(String, default="apple")
    size = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    game_session = relationship("GameSession", back_populates="fruits")

class Flower(Base):
    __tablename__ = "flowers"
    
    id = Column(Integer, primary_key=True, index=True)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=False)
    
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    type = Column(String, default="🌸")
    size = Column(Float, default=1.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    game_session = relationship("GameSession", back_populates="flowers")

# Database setup
def _resolve_database_url() -> str:
    env_database_url = os.getenv("DATABASE_URL")
    if env_database_url:
        return env_database_url

    default_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "perplexitree.db"))
    default_dir = os.path.dirname(default_path)

    try:
        os.makedirs(default_dir, exist_ok=True)
        with open(default_path, "a"):
            pass
        return f"sqlite:///{default_path}"
    except OSError:
        tmp_path = os.path.join("/tmp", "perplexitree.db")
        os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
        return f"sqlite:///{tmp_path}"


DATABASE_URL = _resolve_database_url()
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    # Only create tables if they don't exist (don't drop existing data)
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
