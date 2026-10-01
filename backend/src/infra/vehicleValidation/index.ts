import { config } from '../../config.js';
import { infosimplesVehicleValidation } from './infosimples.js';
import { mockVehicleValidation } from './mock.js';
import type { VehicleValidationProvider } from './types.js';

export const vehicleValidation: VehicleValidationProvider =
  config.vehicleValidation.provider === 'infosimples' ? infosimplesVehicleValidation : mockVehicleValidation;
export type { VehicleValidationInput, VehicleValidationOutput, VehicleValidationProvider } from './types.js';
