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
    // H7: etiqueta de lugar manual — máx 30 chars, sanitizada, auto-invalidada por tiempo/distancia
    label: {
      type: String,
      default: null,
    },
    // H7 CA.4: coordenadas donde se creó la etiqueta, para detectar si el usuario se alejó >500m
    labelLatitude: {
      type: Number,
      default: null,
    },
    labelLongitude: {
      type: Number,
      default: null,
    },
    // H7 CA.4: momento en que se creó la etiqueta, para invalidar tras 6 horas
    labelCreatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Índice compuesto para consultar la última ubicación de un usuario eficientemente
locationSchema.index({ userId: 1, createdAt: -1 });

const Location = mongoose.model('Location', locationSchema);

// H5: un documento por usuario. isPrivate: false por defecto (público si no existe registro).
const locationPrivacySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  }
);

const LocationPrivacy = mongoose.model('LocationPrivacy', locationPrivacySchema);

module.exports = { Location, LocationPrivacy };
