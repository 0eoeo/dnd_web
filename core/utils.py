import asyncio
from multiprocessing import get_context
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def _fetch_html_async(slug: str, timeout_sec: int = 30) -> str:
    url = f"https://ttg.club/spells/{slug}"
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.goto(url, timeout=timeout_sec * 1000)
            try:
                await page.wait_for_selector("div.spell_wrapper.spell-body", timeout=timeout_sec * 1000)
            except Exception:
                await page.wait_for_timeout(1500)
                await page.wait_for_selector("div.spell_wrapper.spell-body", timeout=timeout_sec * 1000)
            el = await page.query_selector("div.spell_wrapper.spell-body")
            raw = await el.inner_html() if el else ""
        finally:
            await browser.close()
    if not raw:
        return "<div class='spell-clean'><em>Не удалось получить описание заклинания.</em></div>"

    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script","style"]): tag.decompose()
    for a in soup.find_all("a"): a.replace_with(a.get_text(strip=True))
    return f"<div class='spell-clean'>{str(soup)}</div>"

def _worker(slug: str, timeout_sec: int) -> str:
    # Запускается в отдельном процессе → свой event loop, проблем с subprocess нет
    return asyncio.run(_fetch_html_async(slug, timeout_sec))

def fetch_spell_html_via_process(slug: str, timeout_sec: int = 30) -> str:
    # Используем spawn на Windows
    ctx = get_context("spawn")
    with ctx.Pool(1) as pool:
        # блокирующий вызов — просто и надёжно
        return pool.apply(_worker, (slug, timeout_sec))