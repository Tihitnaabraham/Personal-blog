(() => {
    const bookList = document.querySelector("#book-list");
    if (!bookList) return;

    const statusKey = "read-reviews-book-status";
    const savedKey = "read-reviews-saved-books";
    const addedKey = "read-reviews-added-books";
    const statusLabels = {
        planned: "Planned read",
        reading: "Currently reading",
        completed: "Completed"
    };

    const readStorage = (key, fallback) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    };

    const writeStorage = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    };

    let statusOverrides = readStorage(statusKey, {});
    let savedBooks = new Set(readStorage(savedKey, []));
    let addedBooks = readStorage(addedKey, []);
    const obsoleteMerbebitIds = new Set(addedBooks
        .filter((book) => String(book.buyUrl || "").includes("p165905975"))
        .map((book) => book.id));
    if (obsoleteMerbebitIds.size > 0) {
        addedBooks = addedBooks.filter((book) => !obsoleteMerbebitIds.has(book.id));
        savedBooks = new Set([...savedBooks].filter((id) => !obsoleteMerbebitIds.has(id)));
        for (const id of obsoleteMerbebitIds) delete statusOverrides[id];
        writeStorage(addedKey, addedBooks);
        writeStorage(savedKey, [...savedBooks]);
        writeStorage(statusKey, statusOverrides);
    }
    let activeStatus = "planned";
    let activeGenre = "all";
    let searchTerm = "";
    let savedOnly = false;

    const searchToggle = document.querySelector("#search-toggle");
    const searchPanel = document.querySelector("#search-panel");
    const searchInput = document.querySelector("#book-search");
    const emptyMessage = document.querySelector("#empty-message");
    const addDialog = document.querySelector("#add-book-dialog");
    const addForm = document.querySelector("#add-book-form");
    const coverFileInput = document.querySelector("#book-cover-file");
    const coverPreview = document.querySelector("#cover-preview");
    const maxCoverSize = 500 * 1024;
    let selectedCoverData = "";

    const safeUrl = (value) => {
        try {
            const url = new URL(value, window.location.href);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
        } catch {
            return "#";
        }
    };

    const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);

    const readImageFile = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(file);
    });

    const updateBookCount = () => {
        const cards = [...bookList.querySelectorAll(".library-book")];
        for (const status of Object.keys(statusLabels)) {
            const count = cards.filter((card) => card.dataset.status === status).length;
            const counter = document.querySelector(`[data-count="${status}"]`);
            if (counter) counter.textContent = count;
        }
        const allCount = document.querySelector('[data-genre-count="all"]');
        if (allCount) allCount.textContent = cards.length;
    };

    const renderBooks = () => {
        const cards = [...bookList.querySelectorAll(".library-book")];
        let visibleCount = 0;

        for (const card of cards) {
            const matchesStatus = savedOnly
                ? savedBooks.has(card.dataset.bookId)
                : card.dataset.status === activeStatus;
            const matchesGenre = activeGenre === "all" || card.dataset.genre === activeGenre;
            const searchableText = `${card.dataset.title} ${card.dataset.author}`.toLowerCase();
            const matchesSearch = searchableText.includes(searchTerm);
            card.hidden = !(matchesStatus && matchesGenre && matchesSearch);
            if (!card.hidden) visibleCount += 1;
        }

        emptyMessage.hidden = visibleCount > 0;
        updateBookCount();
    };

    const attachCardEvents = (card) => {
        const id = card.dataset.bookId;
        const statusSelect = card.querySelector(".status-control select");
        const bookmark = card.querySelector(".bookmark-button");

        if (statusOverrides[id]) {
            card.dataset.status = statusOverrides[id];
            statusSelect.value = statusOverrides[id];
        }

        statusSelect.addEventListener("change", () => {
            card.dataset.status = statusSelect.value;
            statusOverrides[id] = statusSelect.value;
            writeStorage(statusKey, statusOverrides);
            renderBooks();
        });

        const updateBookmark = () => {
            const isSaved = savedBooks.has(id);
            bookmark.setAttribute("aria-pressed", String(isSaved));
            bookmark.setAttribute("aria-label", `${isSaved ? "Remove" : "Save"} ${card.dataset.title}`);
            bookmark.innerHTML = `<i class="fa-${isSaved ? "solid" : "regular"} fa-bookmark" aria-hidden="true"></i>`;
        };

        updateBookmark();
        bookmark.addEventListener("click", () => {
            if (savedBooks.has(id)) savedBooks.delete(id);
            else savedBooks.add(id);
            writeStorage(savedKey, [...savedBooks]);
            updateBookmark();
            renderBooks();
        });
    };

    const createBookCard = (book) => {
        const card = document.createElement("article");
        card.className = "library-book";
        card.dataset.bookId = book.id;
        card.dataset.status = book.status || "planned";
        card.dataset.genre = book.genre || "fiction";
        card.dataset.title = book.title;
        card.dataset.author = book.author;

        const title = escapeHTML(book.title);
        const author = escapeHTML(book.author);
        const retailerUrl = safeUrl(book.buyUrl);
        const suppliedPdfUrl = book.pdfUrl ? safeUrl(book.pdfUrl) : "";
        const previewUrl = suppliedPdfUrl && suppliedPdfUrl !== "#"
            ? suppliedPdfUrl
            : `https://books.google.com/books?q=${encodeURIComponent(`${book.title} ${book.author}`)}`;
        const safeRetailerUrl = escapeHTML(retailerUrl);
        const safePreviewUrl = escapeHTML(previewUrl);
        const retailerName = new URL(retailerUrl).hostname.replace(/^www\./, "");
        const coverUrl = book.coverUrl && /^data:image\/(?:jpeg|png|webp);base64,/i.test(book.coverUrl)
            ? book.coverUrl
            : "";
        const cover = coverUrl
            ? `<img src="${coverUrl}" alt="Cover of ${title}">`
            : `<span class="generated-cover-title" aria-hidden="true">${title}</span>`;
        const previewLabel = suppliedPdfUrl && suppliedPdfUrl !== "#" ? "Find PDF" : "Read or preview online";
        const options = Object.entries(statusLabels).map(([value, label]) =>
            `<option value="${value}" ${card.dataset.status === value ? "selected" : ""}>${label}</option>`
        ).join("");

        card.innerHTML = `
            <a class="book-cover" href="${safeRetailerUrl}" target="_blank" rel="noopener noreferrer" aria-label="Find ${title}">${cover}</a>
            <div class="library-book-details">
                <div class="book-card-topline">
                    <label class="status-control"><span class="visually-hidden">Reading status for ${title}</span><select aria-label="Reading status for ${title}">${options}</select></label>
                    <button class="bookmark-button" type="button" aria-pressed="false" aria-label="Save ${title}"><i class="fa-regular fa-bookmark" aria-hidden="true"></i></button>
                </div>
                <h2>${title}</h2>
                <p class="book-description">Added to your reading list</p>
                <p class="book-byline">By <span>${author}</span></p>
                <a class="book-buy" href="${safePreviewUrl}" target="_blank" rel="noopener noreferrer">${previewLabel} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
                <a class="book-retailer" href="${safeRetailerUrl}" target="_blank" rel="noopener noreferrer">Find a copy at ${escapeHTML(retailerName)}</a>
            </div>`;

        const image = card.querySelector(".book-cover img");
        if (image) image.addEventListener("error", () => image.remove());
        attachCardEvents(card);
        return card;
    };

    for (const card of bookList.querySelectorAll(".library-book")) {
        attachCardEvents(card);
    }

    for (const book of addedBooks) {
        bookList.append(createBookCard(book));
    }

    for (const tab of document.querySelectorAll("[data-status-view]")) {
        tab.addEventListener("click", () => {
            activeStatus = tab.dataset.statusView;
            savedOnly = false;
            document.querySelector("#saved-view-toggle").setAttribute("aria-pressed", "false");
            document.querySelector("#saved-view-toggle").classList.remove("is-current");
            for (const item of document.querySelectorAll("[data-status-view]")) {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-selected", String(active));
            }
            renderBooks();
        });
    }

    for (const chip of document.querySelectorAll("[data-genre-filter]")) {
        chip.addEventListener("click", () => {
            activeGenre = chip.dataset.genreFilter;
            for (const item of document.querySelectorAll("[data-genre-filter]")) {
                const active = item === chip;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            }
            renderBooks();
        });
    }

    searchToggle.addEventListener("click", () => {
        const isOpening = searchPanel.hidden;
        searchPanel.hidden = !isOpening;
        searchToggle.setAttribute("aria-expanded", String(isOpening));
        if (isOpening) searchInput.focus();
        else {
            searchInput.value = "";
            searchTerm = "";
            renderBooks();
        }
    });

    searchInput.addEventListener("input", () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderBooks();
    });

    document.querySelector("#saved-view-toggle").addEventListener("click", (event) => {
        savedOnly = !savedOnly;
        event.currentTarget.setAttribute("aria-pressed", String(savedOnly));
        event.currentTarget.classList.toggle("is-current", savedOnly);
        if (savedOnly) {
            for (const tab of document.querySelectorAll("[data-status-view]")) {
                tab.classList.remove("is-active");
                tab.setAttribute("aria-selected", "false");
            }
        }
        renderBooks();
    });

    document.querySelector("#add-book-trigger").addEventListener("click", () => addDialog.showModal());
    document.querySelector("#dialog-close").addEventListener("click", () => addDialog.close());
    document.querySelector("#dialog-cancel").addEventListener("click", () => addDialog.close());

    coverFileInput.addEventListener("change", async () => {
        const file = coverFileInput.files[0];
        selectedCoverData = "";
        coverPreview.hidden = true;
        coverFileInput.setCustomValidity("");
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            coverFileInput.setCustomValidity("Choose a JPG, PNG, or WebP image.");
            coverFileInput.reportValidity();
            return;
        }
        if (file.size > maxCoverSize) {
            coverFileInput.setCustomValidity("Choose an image smaller than 500 KB.");
            coverFileInput.reportValidity();
            return;
        }
        try {
            selectedCoverData = await readImageFile(file);
            coverPreview.src = selectedCoverData;
            coverPreview.hidden = false;
        } catch {
            coverFileInput.setCustomValidity("This image could not be read.");
            coverFileInput.reportValidity();
        }
    });

    addForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (coverFileInput.files.length && !selectedCoverData) {
            coverFileInput.reportValidity();
            return;
        }
        const data = new FormData(addForm);
        const pdfValue = String(data.get("pdfUrl")).trim();
        const book = {
            id: `custom-${Date.now()}`,
            title: String(data.get("title")).trim(),
            author: String(data.get("author")).trim(),
            genre: String(data.get("genre")),
            buyUrl: safeUrl(String(data.get("buyUrl")).trim()),
            pdfUrl: pdfValue ? safeUrl(pdfValue) : "",
            coverUrl: selectedCoverData,
            status: "planned"
        };
        if (book.buyUrl === "#" || (pdfValue && book.pdfUrl === "#")) return;

        addedBooks.push(book);
        if (!writeStorage(addedKey, addedBooks)) {
            addedBooks.pop();
            window.alert("There is not enough browser storage for this book. Try a smaller cover image.");
            return;
        }
        activeStatus = "planned";
        savedOnly = false;
        document.querySelector('[data-status-view="planned"]').click();
        bookList.append(createBookCard(book));
        addForm.reset();
        selectedCoverData = "";
        coverPreview.removeAttribute("src");
        coverPreview.hidden = true;
        addDialog.close();
        renderBooks();
    });

    renderBooks();
})();
