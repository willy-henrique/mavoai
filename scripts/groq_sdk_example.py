"""
Exemplo oficial com pacote `groq` (SDK Python da Groq — não confundir com Grok/xAI).

  pip install groq python-dotenv
  # .env.local na raiz do projeto com AI_API_KEY ou GROQ_API_KEY=gsk_...

Nunca commite chaves; use só .env.local (gitignored).
"""

from __future__ import annotations

import os
import sys

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment,misc]

try:
    from groq import Groq
except ImportError:
    print("Instale: pip install groq", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if load_dotenv:
        # Next.js usa `.env.local`; carregar na raiz do repo
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        load_dotenv(os.path.join(root, ".env.local"))
        load_dotenv(os.path.join(root, ".env"))

    api_key = (os.environ.get("GROQ_API_KEY") or os.environ.get("AI_API_KEY") or "").strip()
    if not api_key:
        print("Defina GROQ_API_KEY ou AI_API_KEY.", file=sys.stderr)
        sys.exit(1)

    model = (os.environ.get("AI_CHAT_MODEL") or "meta-llama/llama-4-scout-17b-16e-instruct").strip()

    client = Groq(api_key=api_key)
    res = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[{"role": "user", "content": "Explica API em 1 linha"}],
    )
    print(res.choices[0].message.content or "")


if __name__ == "__main__":
    main()
