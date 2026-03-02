function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const LoginPage = {
  html(error) {
    const err = error
      ? `<div class="alert alert-danger" role="alert"><strong>${escapeHtml(error)}</strong></div>`
      : '';
    return `
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width,initial-scale=1"/>
              <title>Sign in</title>
              <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
              <link rel="icon" href="data:,">
              <style>
                .page{max-width:420px;margin-top:10vh}
              </style>
            </head>
            <body class="bg-body-tertiary">
              <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                <div class="container">
                  <a class="navbar-brand" href="/ui/">MySQL REST Service Demo</a>
                </div>
              </nav>
              <main class="container page">
                <div class="card shadow-sm">
                  <div class="card-body">
                    <h1 class="h3">Sign in</h1>
                    <p class="text-body-secondary">Access the MySQL REST Service UI</p>
                    ${err}
                    <form method="post" action="/auth/login" class="vstack gap-3">
                      <div>
                        <label class="form-label">Username</label>
                        <input class="form-control" name="username" autocomplete="username" required>
                      </div>
                      <div>
                        <label class="form-label">Password</label>
                        <input class="form-control" type="password" name="password" autocomplete="current-password" required>
                      </div>
                      <div>
                        <button class="btn btn-primary w-100" type="submit">Sign in</button>
                      </div>
                    </form>
                  </div>
                </div>
              </main>
            </body>
            </html>`;
  },
};
