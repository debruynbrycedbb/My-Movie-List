# My Movie Archive

A static personal movie catalog for GitHub Pages.

## Included
- Only films from the uploaded **Movies I have seen.docx** list are included.
- Explicit ranges are expanded into individual films (for example Star Wars 1–9, Terminator 1–2, Back to the Future 1–3, Indiana Jones 1–4, and Alien 1–7).
- Each movie card includes a poster image loaded from Wikipedia’s public image API, with a fallback title card if an image cannot be found.
- Search, genre filtering, sorting, movie details and 0–10 ratings.
- Dedicated Genres page with clickable main genre categories; each opens `genre.html?genre=...` showing only that genre’s movies.
- Top 10 is generated from your ratings and saved in browser localStorage.

## GitHub Pages
Upload all files in this folder to the root of your repository and publish the `main` branch from `/(root)`.
