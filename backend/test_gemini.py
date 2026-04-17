import os
from dotenv import load_dotenv
from google import genai
import asyncio

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

async def test():
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model='gemini-2.5-flash',
            contents="test"
        )
        print("Success:", response.text)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
