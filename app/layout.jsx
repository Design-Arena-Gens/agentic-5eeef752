export const metadata = {
  title: "Trance Studio",
  description: "Create trance music in your browser",
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
