import os
from dotenv import load_dotenv
from perplexity import Perplexity

load_dotenv()

client = Perplexity() # Uses PERPLEXITY_API_KEY from .env file

search = client.search.create(
    query="plant biology topics",
    max_results=5,
    max_tokens_per_page=1024
)

for result in search.results:
    print(f"{result.title}: {result.url}")