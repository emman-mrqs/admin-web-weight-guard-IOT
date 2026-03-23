// src/controller/api/incidentController.js
// API Controller for receiving weight data from Arduino and auto-detecting incidents
import db from '../../database/db.js';

const WEIGHT_UNITS_TO_KG = {
	kg: 1,
	g: 0.001,
	t: 1000,
	ton: 1000,
	tons: 1000,
	tonne: 1000,
	tonnes: 1000
};

function normalizeWeightToKg(weight, unit = 'kg') {
	const parsedWeight = Number(weight);
	const normalizedUnit = String(unit || 'kg').trim().toLowerCase();
	const multiplier = WEIGHT_UNITS_TO_KG[normalizedUnit];

	if (!Number.isFinite(parsedWeight) || parsedWeight < 0 || !multiplier) {
		return null;
	}

	return parsedWeight * multiplier;
}

function toNullableNumber(value) {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const num = Number(value);
	return Number.isFinite(num) ? num : null;
}

async function upsertDetectedIncident({
	taskId,
	vehicleId,
	driverId,
	incidentType,
	severity,
	weightImpactKg,
	latitude,
	longitude
}) {
	const existingResult = await db.query(
		`
			SELECT id
			FROM incidents
			WHERE task_id IS NOT DISTINCT FROM $1
			  AND vehicle_id = $2
			  AND LOWER(COALESCE(incident_type, '')) = $3
			  AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'open', 'acknowledged', 'investigating')
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		`,
		[taskId, vehicleId, incidentType]
	);

	if (existingResult.rows.length > 0) {
		const incidentId = existingResult.rows[0].id;
		await db.query(
			`
				UPDATE incidents
				SET
					severity = $1,
					weight_impact_kg = CASE
						WHEN $2::numeric IS NULL THEN weight_impact_kg
						WHEN weight_impact_kg IS NULL THEN $2::numeric
						ELSE GREATEST(weight_impact_kg, $2::numeric)
					END,
					latitude = COALESCE($3::numeric, latitude),
					longitude = COALESCE($4::numeric, longitude)
				WHERE id = $5
			`,
			[severity, weightImpactKg, latitude, longitude, incidentId]
		);

		return { id: incidentId, type: incidentType, action: 'updated' };
	}

	const insertResult = await db.query(
		`
			INSERT INTO incidents (
				managed_by,
				vehicle_id,
				driver_id,
				task_id,
				incident_type,
				severity,
				weight_impact_kg,
				latitude,
				longitude,
				status,
				created_at
			)
			VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
			RETURNING id
		`,
		[vehicleId, driverId, taskId, incidentType, severity, weightImpactKg, latitude, longitude]
	);

	return { id: insertResult.rows[0].id, type: incidentType, action: 'created' };
}

class IncidentApiController {
	/**
	 * POST /api/incidents/telemetry
	 * Ingest telemetry and auto-detect incidents.
	 */
	static async ingestTelemetry(req, res) {
		try {
			const {
				vehicleId,
				taskId,
				currentWeight,
				weightUnit,
				latitude,
				longitude,
				speedKmh,
				recordedAt
			} = req.body || {};

			const fieldErrors = {};
			const normalizedVehicleId = Number(vehicleId);
			const normalizedTaskId = taskId ? Number(taskId) : null;
			const normalizedLatitude = toNullableNumber(latitude);
			const normalizedLongitude = toNullableNumber(longitude);
			const normalizedSpeedKmh = toNullableNumber(speedKmh);
			const normalizedWeightKg = normalizeWeightToKg(currentWeight, weightUnit || 'kg');

			if (!Number.isFinite(normalizedVehicleId) || normalizedVehicleId <= 0) {
				fieldErrors.vehicleId = 'Vehicle ID must be a valid positive number.';
			}

			if (taskId !== undefined && taskId !== null && taskId !== '' && (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0)) {
				fieldErrors.taskId = 'Task ID must be a valid positive number.';
			}

			if (normalizedWeightKg === null) {
				fieldErrors.currentWeight = 'Current weight must be a valid non-negative number.';
			}

			if (normalizedLatitude !== null && (normalizedLatitude < -90 || normalizedLatitude > 90)) {
				fieldErrors.latitude = 'Latitude must be between -90 and 90.';
			}

			if (normalizedLongitude !== null && (normalizedLongitude < -180 || normalizedLongitude > 180)) {
				fieldErrors.longitude = 'Longitude must be between -180 and 180.';
			}

			if (normalizedSpeedKmh !== null && normalizedSpeedKmh < 0) {
				fieldErrors.speedKmh = 'Speed must be greater than or equal to 0.';
			}

			let normalizedRecordedAt = null;
			if (recordedAt !== undefined && recordedAt !== null && recordedAt !== '') {
				const parsed = new Date(recordedAt);
				if (Number.isNaN(parsed.getTime())) {
					fieldErrors.recordedAt = 'Recorded timestamp must be a valid ISO date string.';
				} else {
					normalizedRecordedAt = parsed.toISOString();
				}
			}

			if (Object.keys(fieldErrors).length > 0) {
				return res.status(400).json({
					error: 'Validation failed.',
					fieldErrors
				});
			}

			const vehicleResult = await db.query(
				`
					SELECT id, assigned_driver_id, max_capacity_kg
					FROM vehicles
					WHERE id = $1
					LIMIT 1
				`,
				[normalizedVehicleId]
			);

			if (vehicleResult.rows.length === 0) {
				return res.status(404).json({ error: 'Vehicle not found.' });
			}

			const vehicle = vehicleResult.rows[0];
			let selectedTask = null;

			if (normalizedTaskId) {
				const taskResult = await db.query(
					`
						SELECT id, vehicle_id, initial_reference_weight_kg, status
						FROM dispatch_tasks
						WHERE id = $1
						LIMIT 1
					`,
					[normalizedTaskId]
				);

				if (taskResult.rows.length === 0) {
					return res.status(404).json({ error: 'Dispatch task not found.' });
				}

				selectedTask = taskResult.rows[0];
				if (Number(selectedTask.vehicle_id) !== normalizedVehicleId) {
					return res.status(400).json({
						error: 'Validation failed.',
						fieldErrors: {
							taskId: 'Dispatch task does not belong to the selected vehicle.'
						}
					});
				}
			} else {
				const activeTaskResult = await db.query(
					`
						SELECT id, vehicle_id, initial_reference_weight_kg, status
						FROM dispatch_tasks
						WHERE vehicle_id = $1
						  AND LOWER(COALESCE(status, '')) IN ('active', 'pending')
						ORDER BY created_at DESC, id DESC
						LIMIT 1
					`,
					[normalizedVehicleId]
				);
				selectedTask = activeTaskResult.rows[0] || null;
			}

			let previousWeightKg = null;
			if (selectedTask?.id) {
				const prevTaskLog = await db.query(
					`
						SELECT current_weight_kg
						FROM telemetry_logs
						WHERE task_id = $1
						ORDER BY recorded_at DESC, id DESC
						LIMIT 1
					`,
					[selectedTask.id]
				);
				previousWeightKg = prevTaskLog.rows[0]?.current_weight_kg !== undefined
					? Number(prevTaskLog.rows[0].current_weight_kg)
					: null;
			}

			const telemetryInsert = await db.query(
				`
					INSERT INTO telemetry_logs (
						vehicle_id,
						task_id,
						latitude,
						longitude,
						speed_kmh,
						current_weight_kg,
						recorded_at
					)
					VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
					RETURNING id, recorded_at
				`,
				[
					normalizedVehicleId,
					selectedTask?.id || null,
					normalizedLatitude,
					normalizedLongitude,
					normalizedSpeedKmh,
					normalizedWeightKg,
					normalizedRecordedAt
				]
			);

			const detections = [];

			if (selectedTask?.id) {
				const initialReferenceKg = selectedTask.initial_reference_weight_kg !== null
					? Number(selectedTask.initial_reference_weight_kg)
					: null;
				const maxCapacityKg = vehicle.max_capacity_kg !== null
					? Number(vehicle.max_capacity_kg)
					: null;

				if (Number.isFinite(initialReferenceKg) && Number.isFinite(maxCapacityKg) && initialReferenceKg > maxCapacityKg) {
					const overloadImpact = initialReferenceKg - maxCapacityKg;
					const overloadIncident = await upsertDetectedIncident({
						taskId: selectedTask.id,
						vehicleId: normalizedVehicleId,
						driverId: vehicle.assigned_driver_id || null,
						incidentType: 'overload',
						severity: 'warning',
						weightImpactKg: overloadImpact,
						latitude: normalizedLatitude,
						longitude: normalizedLongitude
					});
					detections.push(overloadIncident);
				}

				if (Number.isFinite(previousWeightKg) && previousWeightKg > normalizedWeightKg) {
					const lostKg = previousWeightKg - normalizedWeightKg;
					if (lostKg >= 1) {
						const cargoLossIncident = await upsertDetectedIncident({
							taskId: selectedTask.id,
							vehicleId: normalizedVehicleId,
							driverId: vehicle.assigned_driver_id || null,
							incidentType: 'cargo_loss',
							severity: 'critical',
							weightImpactKg: lostKg,
							latitude: normalizedLatitude,
							longitude: normalizedLongitude
						});
						detections.push(cargoLossIncident);
					}
				}
			}

			return res.status(201).json({
				message: 'Telemetry recorded successfully.',
				data: {
					telemetryId: telemetryInsert.rows[0].id,
					recordedAt: telemetryInsert.rows[0].recorded_at,
					currentWeightKg: normalizedWeightKg,
					incidents: detections
				}
			});
		} catch (error) {
			console.error('Error ingesting telemetry:', error);
			return res.status(500).json({
				error: 'An error occurred while processing telemetry data.'
			});
		}
	}
}

export default IncidentApiController;
