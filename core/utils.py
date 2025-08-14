import time
from playwright.sync_api import sync_playwright, TimeoutError
from bs4 import BeautifulSoup

from core.config import SPELLS


def _safe_text(el):
    try:
        return (el.inner_text() or "").strip()
    except Exception:
        return ""


def get_spells_list():
    return SPELLS
    # url = "https://ttg.club/spells"
    # spells = []
    # seen_slugs = set()
    # api_spells = []
    # api_seen = set()
    #
    # def normalize_row(row):
    #     name = (row.get("name_ru") or row.get("name") or "").strip()
    #     slug = (row.get("slug") or "").strip()
    #     level = str(row.get("level") or row.get("lvl") or "").strip()
    #     school = (row.get("school_ru") or row.get("school") or "").strip()
    #     source = (row.get("source") or row.get("src") or "").strip()
    #     return name, slug, level, school, source
    #
    # with sync_playwright() as p:
    #     browser = p.chromium.launch(headless=True)
    #     page = browser.new_page()
    #
    #     # 1) Ловим ЛЮБЫЕ ответы API, где в URL есть 'api' и 'spells'
    #     def on_response(resp):
    #         try:
    #             u = resp.url
    #             if "api" in u and "spells" in u:
    #                 data = resp.json()
    #                 rows = []
    #                 if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
    #                     rows = data["data"]
    #                 elif isinstance(data, list):
    #                     rows = data
    #                 # бывают вложенные структуры — попробуем найти списки словарей со slug внутри
    #                 elif isinstance(data, dict):
    #                     for v in data.values():
    #                         if isinstance(v, list) and v and isinstance(v[0], dict):
    #                             rows = v
    #                             break
    #
    #                 for row in rows:
    #                     if not isinstance(row, dict):
    #                         continue
    #                     name, slug, level, school, source = normalize_row(row)
    #                     if slug and slug not in api_seen:
    #                         api_spells.append({
    #                             "name": name,
    #                             "slug": slug,
    #                             "level": level,
    #                             "school": school,
    #                             "source": source
    #                         })
    #                         api_seen.add(slug)
    #         except Exception:
    #             pass
    #
    #     page.on("response", on_response)
    #
    #     page.goto(url, timeout=60000)
    #     page.wait_for_selector("div.virtual-list__item", timeout=30000)
    #
    #     # подождём чуть-чуть — вдруг API уже всё дал
    #     for _ in range(20):
    #         if api_spells:
    #             break
    #         time.sleep(0.15)
    #
    #     # Если API уже отдал полный список — это лучший вариант
    #     if api_spells:
    #         browser.close()
    #         return api_spells
    #
    #     # 2) Ищем реальный скролл-контейнер (а не window)
    #     # Берём ближайший прокручиваемый родитель .virtual-list__item
    #     has_container = page.evaluate("""
    #         () => {
    #           const item = document.querySelector('.virtual-list__item');
    #           function isScrollable(el){
    #             if(!el) return false;
    #             const st = getComputedStyle(el);
    #             return /(auto|scroll)/.test(st.overflowY || '') && el.scrollHeight > el.clientHeight;
    #           }
    #           let el = item;
    #           while(el){
    #             if(isScrollable(el)) return true;
    #             el = el.parentElement;
    #           }
    #           return false;
    #         }
    #     """)
    #
    #     def scroll_to_edge(top: bool):
    #         if has_container:
    #             page.evaluate(
    #                 """(toTop) => {
    #                    const item = document.querySelector('.virtual-list__item');
    #                    function scrollable(el){
    #                      if(!el) return null;
    #                      const st = getComputedStyle(el);
    #                      return /(auto|scroll)/.test(st.overflowY||'') && el.scrollHeight > el.clientHeight ? el : null;
    #                    }
    #                    let el = item;
    #                    let sc = null;
    #                    while(el && !sc){ sc = scrollable(el); el = el.parentElement; }
    #                    if(!sc) return;
    #                    sc.scrollTop = toTop ? 0 : (sc.scrollHeight - sc.clientHeight);
    #                    sc.dispatchEvent(new Event('scroll', {bubbles:true}));
    #                 }""",
    #                 top
    #             )
    #         else:
    #             page.evaluate("toTop => window.scrollTo(0, toTop ? 0 : document.body.scrollHeight)", top)
    #
    #     def scroll_step(px: int):
    #         if has_container:
    #             page.evaluate(
    #                 """(dy) => {
    #                    const item = document.querySelector('.virtual-list__item');
    #                    function scrollable(el){
    #                      if(!el) return null;
    #                      const st = getComputedStyle(el);
    #                      return /(auto|scroll)/.test(st.overflowY||'') && el.scrollHeight > el.clientHeight ? el : null;
    #                    }
    #                    let el = item;
    #                    let sc = null;
    #                    while(el && !sc){ sc = scrollable(el); el = el.parentElement; }
    #                    if(!sc) return;
    #                    sc.scrollTop = Math.max(0, Math.min(sc.scrollTop + dy, sc.scrollHeight - sc.clientHeight));
    #                    sc.dispatchEvent(new Event('scroll', {bubbles:true}));
    #                 }""",
    #                 px
    #             )
    #         else:
    #             page.evaluate("dy => window.scrollBy(0, dy)", px)
    #
    #     # сбор текущих видимых элементов
    #     def collect_visible_now():
    #         links = page.query_selector_all("div.virtual-list__item a.link-item")
    #         for a in links:
    #             href = a.get_attribute("href") or ""
    #             if not href.startswith("/spells/"):
    #                 continue
    #             slug = href.rsplit("/", 1)[-1]
    #             if not slug or slug in seen_slugs:
    #                 continue
    #
    #             name_el = a.query_selector("span.link-item__name--rus")
    #             lvl_el = a.query_selector("div.link-item__lvl")
    #             school_el = a.query_selector("div.link-item__school")
    #             source_el = a.query_selector("div.link-item__source")
    #
    #             def safe_text(el):
    #                 try:
    #                     return (el.inner_text() or "").strip()
    #                 except Exception:
    #                     return ""
    #
    #             name = safe_text(name_el)
    #             level = safe_text(lvl_el)
    #             school = safe_text(school_el)
    #             source = safe_text(source_el)
    #
    #             spells.append({
    #                 "name": name,
    #                 "slug": slug,
    #                 "level": level,
    #                 "school": school,
    #                 "source": source
    #             })
    #             seen_slugs.add(slug)
    #
    #     # 3) Глубокий скролл: вниз до упора, потом в самый верх, снова вниз.
    #     # На каждом шаге — собираем видимые и ждём, пока «счётчик» перестанет расти.
    #     def deep_scan():
    #         last_count = -1
    #         stagnant_rounds = 0
    #         STEP = 900
    #         SLEEP = 0.28
    #         STALL_LIMIT = 10
    #         MAX_ROUNDS = 700
    #
    #         # вниз
    #         for _ in range(MAX_ROUNDS):
    #             collect_visible_now()
    #             # если в процессе прилетит API — используем его
    #             if api_spells:
    #                 return True
    #             cur = len(seen_slugs)
    #             if cur == last_count:
    #                 stagnant_rounds += 1
    #             else:
    #                 stagnant_rounds = 0
    #                 last_count = cur
    #             if stagnant_rounds >= STALL_LIMIT:
    #                 break
    #             scroll_step(STEP)
    #             time.sleep(SLEEP)
    #
    #         # вверх + сбор
    #         scroll_to_edge(True)
    #         time.sleep(0.4)
    #         collect_visible_now()
    #
    #         # ещё раз вниз
    #         last_count = -1
    #         stagnant_rounds = 0
    #         for _ in range(MAX_ROUNDS // 2):
    #             collect_visible_now()
    #             if api_spells:
    #                 return True
    #             cur = len(seen_slugs)
    #             if cur == last_count:
    #                 stagnant_rounds += 1
    #             else:
    #                 stagnant_rounds = 0
    #                 last_count = cur
    #             if stagnant_rounds >= STALL_LIMIT:
    #                 break
    #             scroll_step(STEP)
    #             time.sleep(SLEEP)
    #
    #         return False
    #
    #     got_api_midway = deep_scan()
    #
    #     # если по пути начали прилетать API-ответы — они приоритетнее
    #     if api_spells and got_api_midway:
    #         browser.close()
    #         return api_spells
    #
    #     # объединяем: сначала API (если был), потом то, что собрали из DOM, без дублей
    #     merged = []
    #     seen = set()
    #     for row in api_spells + spells:
    #         slug = row.get("slug")
    #         if slug and slug not in seen:
    #             merged.append(row)
    #             seen.add(slug)
    #
    #     browser.close()
    #     pprint(merged)
    #     return merged

# ---------- Детальная страница ----------

def get_spell_detail(slug: str) -> str:
    """
    Возвращает ЧИСТЫЙ HTML-фрагмент описания заклинания:
    - без <a> (сохранён текст)
    - с таблицей характеристик
    - с аккуратным текстом описания
    """
    url = f"https://ttg.club/spells/{slug}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, timeout=60000)

        # ждём основной контейнер
        try:
            page.wait_for_selector("div.spell_wrapper.spell-body", timeout=30000)
        except TimeoutError:
            time.sleep(1.5)
            page.wait_for_selector("div.spell_wrapper.spell-body", timeout=30000)

        element = page.query_selector("div.spell_wrapper.spell-body")
        raw_html = element.inner_html() if element else ""
        browser.close()

    if not raw_html:
        return "<div class='spell-clean'><em>Не удалось получить описание заклинания.</em></div>"

    soup = BeautifulSoup(raw_html, "html.parser")

    # 1) Удаляем скрипты/стили и разворачиваем ссылки
    for tag in soup(["script", "style"]):
        tag.decompose()
    for a in soup.find_all("a"):
        a.replace_with(a.get_text(strip=True))

    # 2) Извлекаем верхние сведения
    #    В шапке обычно есть .row_info с левым/правым блоками
    top_left = top_right = ""
    row_info = soup.select_one(".row_info")
    if row_info:
        left = row_info.select_one(".left_info")
        right = row_info.select_one(".right_info")
        top_left = " ".join(left.stripped_strings) if left else ""
        top_right = " ".join(right.stripped_strings) if right else ""

    # 3) Сетка с параметрами (табличные блоки)
    meta = {}
    grid = soup.select_one(".grid_stat_block")
    if grid:
        for block in grid.select(".block"):
            label = (block.find("p").get_text(strip=True) if block.find("p") else "").rstrip(":")
            value = " ".join(block.stripped_strings)
            # убрать дублирующееся название параметра в value
            if label and value.lower().startswith(label.lower()):
                value = value[len(label):].lstrip(" :")
            meta[label] = value

    # 4) Классы и прочие списки внизу (если есть)
    #    Обычно блоки вида ".spell_stat_block_bottom" c "Классы:", "Подклассы:" и т.п.
    for bottom in soup.select(".spell_stat_block_bottom"):
        p = bottom.find("p")
        if not p:
            continue
        label = p.get_text(strip=True).rstrip(":")
        val = " ".join(bottom.stripped_strings)
        if label and val:
            # убираем повтор заголовка
            if val.lower().startswith(label.lower()):
                val = val[len(label):].lstrip(" :")
            meta[label] = val

    # 5) Основное содержимое (описание)
    content_html = ""
    content = soup.select_one(".content-padding")
    if content:
        # убрать любые «нижние» информационные блоки, если они случайно попали внутрь content
        # (на сайте это иногда дублируется)
        for b in content.select(".spell_stat_block_bottom"):
            b.decompose()

        # убрать блоки-параграфы с заголовками вида «Классы:», «Подклассы:», «Расы и происхождения:»
        kill_labels = {"Классы", "Подклассы", "Расы и происхождения"}
        for blk in list(content.find_all(recursive=False)):
            p = blk.find("p", recursive=False)
            if p and p.get_text(strip=True).rstrip(":") in kill_labels:
                blk.decompose()

        # Разворачиваем ссылки в текст
        for a in content.find_all("a"):
            a.replace_with(a.get_text(strip=True))

        # Чистим служебные атрибуты
        for tag in content.find_all():
            attrs = dict(tag.attrs)
            for k in list(attrs.keys()):
                if k.startswith("data-") or k in ("class", "style", "aria-expanded"):
                    del tag.attrs[k]

        # Удаляем пустые элементы (после чистки)
        for tag in list(content.find_all()):
            if not tag.get_text(strip=True):
                tag.decompose()

        content_html = "".join(str(el) for el in content.contents).strip()

    # 6) Сборка чистого HTML
    #    Заголовочную строку аккуратно разделяем на "уровень/школа" и "источник"
    #    top_left: "3 уровень, преобразование [Рунная магия]"
    #    top_right: "Источник: 3rd MHH"
    level_school = top_left or ""
    source = ""
    if top_right:
        # убираем "Источник:" если присутствует
        source = top_right
        if source.lower().startswith("источник"):
            source = source.split(":", 1)[-1].strip()

    # Согласуем ключи в meta к ожидаемым именам строк
    row_map = [
        ("Уровень / школа", level_school),
        ("Источник", source or meta.get("Источник", "")),
        ("Время накладывания", meta.get("Время накладывания", "")),
        ("Дистанция", meta.get("Дистанция", "")),
        ("Длительность", meta.get("Длительность", "")),
        ("Компоненты", meta.get("Компоненты", "")),
        ("Классы", meta.get("Классы", "")),
        ("Подклассы", meta.get("Подклассы", "")),
    ]

    # Оставляем только непустые строки
    rows_html = "\n".join(
        f"<tr><th>{label}</th><td>{BeautifulSoup(val, 'html.parser').get_text(' ', strip=True)}</td></tr>"
        for (label, val) in row_map if val
    )

    # Итоговый чистый блок
    clean_html = f"""
    <div class="spell-clean">
      <table class="spell-table">
        <tbody>
          {rows_html}
        </tbody>
      </table>
      <div class="spell-text">
        {content_html or "<p><em>Описание отсутствует.</em></p>"}
      </div>
    </div>
    """.strip()

    return clean_html
