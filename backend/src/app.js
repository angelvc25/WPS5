import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import storeRoutes from './routes/store.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use('/api/store', storeRoutes);

app.listen(PORT, () => {
  console.log(`[WPS5 Backend] API running on http://localhost:${PORT}`);
});
