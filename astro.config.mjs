import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://stitch-sampler.carlosaguirre.workers.dev',
  devToolbar: { enabled: false },
  vite: { server: { proxy: { '/api': 'http://localhost:4378' } } },
});
