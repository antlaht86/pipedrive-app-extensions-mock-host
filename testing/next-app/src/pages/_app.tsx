import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { JetBrains_Mono } from 'next/font/google';

// A single monospace face — the "control console" identity.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700', '800'],
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={mono.variable}>
      <Component {...pageProps} />
    </div>
  );
}
