type DroneInfo = {
  modelName: string;
  maximumSpeed: number; // km/h
  operationalRange: number; // km
  maximumAltitude: number; // meters
  endurance: number; // minutes
  payloadCapacity: number; // kg
};

export const drones: Record<string, DroneInfo> = {
  drone_A: {
    modelName: "DJI Mavic 3",
    maximumSpeed: 68,
    operationalRange: 15,
    maximumAltitude: 6000,
    endurance: 46,
    payloadCapacity: 0.2,
  },
  drone_B: {
    modelName: "Autel EVO II Pro",
    maximumSpeed: 72,
    operationalRange: 9,
    maximumAltitude: 7000,
    endurance: 40,
    payloadCapacity: 0.2,
  },
  drone_C: {
    modelName: "Parrot Anafi USA",
    maximumSpeed: 55,
    operationalRange: 5,
    maximumAltitude: 4500,
    endurance: 32,
    payloadCapacity: 0.3,
  },
  drone_D: {
    modelName: "Custom Quadrotor (Hobbyist)",
    maximumSpeed: 50,
    operationalRange: 3,
    maximumAltitude: 2000,
    endurance: 20,
    payloadCapacity: 0.1,
  },
  drone_E: {
    modelName: "WingtraOne Gen II",
    maximumSpeed: 90,
    operationalRange: 10,
    maximumAltitude: 5000,
    endurance: 55,
    payloadCapacity: 1.0,
  },
  drone_F: {
    modelName: "Skydio X2D",
    maximumSpeed: 58,
    operationalRange: 10,
    maximumAltitude: 3000,
    endurance: 35,
    payloadCapacity: 0.2,
  },
  drone_G: {
    modelName: "Large Fixed-Wing Surveillance UAV (Fictional)",
    maximumSpeed: 120,
    operationalRange: 80,
    maximumAltitude: 6000,
    endurance: 240, // 4 hours
    payloadCapacity: 5,
  },
  drone_H: {
    modelName: "FPV Racing Drone",
    maximumSpeed: 140,
    operationalRange: 2,
    maximumAltitude: 300,
    endurance: 7,
    payloadCapacity: 0.05,
  },
  drone_I: {
    modelName: "Agricultural Hexacopter",
    maximumSpeed: 40,
    operationalRange: 7,
    maximumAltitude: 1500,
    endurance: 25,
    payloadCapacity: 8,
  },
  drone_J: {
    modelName: "Industrial VTOL Multirole (Fictional)",
    maximumSpeed: 80,
    operationalRange: 20,
    maximumAltitude: 4000,
    endurance: 90,
    payloadCapacity: 3,
  },
};
