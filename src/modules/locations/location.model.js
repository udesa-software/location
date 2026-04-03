const mongoose = require('mongoose');

// Cada documento representa una actualización de ubicación de un usuario.
// Se guarda el historial completo — para mostrar en el mapa siempre se consulta la más reciente.
const locationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Índice compuesto para consultar la última ubicación de un usuario eficientemente
locationSchema.index({ userId: 1, createdAt: -1 });

const Location = mongoose.model('Location', locationSchema);

module.exports = { Location };
