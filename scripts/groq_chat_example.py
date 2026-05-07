"""
Smoke test Groq alinhado ao Cérebro (Next.js usa POST .../chat/completions, nao Responses API).

O snippet com client.responses.create nao espelha este projeto: usamos Chat Completions.
Modelo multimodal padrao Groq: meta-llama/llama-4-scout-17b-16e-instruct (texto + imagem no orquestrador).

Uso:
  pip install openai python-dotenv
  copy .env.local to cwd or: export AI_API_KEY=gsk_...
  python scripts/groq_chat_example.py
"""

from __future__ import annotations

import os
import sys

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment,misc]

try:
    from openai import OpenAI
except ImportError:
    print("Instale: pip install openai", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if load_dotenv:
        load_dotenv()

    api_key = (os.environ.get("AI_API_KEY") or os.environ.get("GROQ_API_KEY") or "").strip()
    base_url = (os.environ.get("AI_BASE_URL") or "https://api.groq.com/openai/v1").rstrip("/")
    model = (os.environ.get("AI_CHAT_MODEL") or "meta-llama/llama-4-scout-17b-16e-instruct").strip()

    if not api_key:
        print("Defina AI_API_KEY ou GROQ_API_KEY (chave Groq gsk_...).", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key, base_url=base_url)

    response = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[
            {
                "role": "user",
                "content": "Explain the importance of fast language models in one short paragraph.",
            },
        ],
    )
    msg = response.choices[0].message
    print(msg.content or "")


if __name__ == "__main__":
    main()
