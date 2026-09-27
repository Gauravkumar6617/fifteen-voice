# Markdown

A voice agent that lets store merchants run sales and discounts safely.
Built for the AssemblyAI Voice Agent Hackathon.

## Run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then put your AssemblyAI key in .env
uvicorn app.main:app --reload
```

Check it: `curl localhost:8000/health` returns `{"status":"ok"}`.

## Run the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev   # open http://localhost:5173 and press Start talking
```

## License

MIT
