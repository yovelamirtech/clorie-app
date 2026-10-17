import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0e9f6e' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0e9f6e' } },
  },
  images: ['public/icon.svg'],
});
