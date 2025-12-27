const { pg } = require("../config/postgres");
const { DateTime } = require("luxon");

async function getTripsByStops(traversedStops, timestamp){
    if (!Array.isArray(traversedStops) || traversedStops.length < 1 || !timestamp) {
        return []; // Ritorna un array vuoto se i nodi non sono validi
    }

    const stopsCode = "stop_code = '" + traversedStops.map(stop => stop.stop_code).join("' OR stop_code = '") + "'";
    const romeNow = DateTime.now().setZone('Europe/Rome');
    const todayDate = romeNow.toISODate();
    const yesterdayDate = romeNow.minus({ days: 1 }).toISODate();

    const offset = 15; // 15 minuti di offset

    const yesterdayWindowStartDT = romeNow.minus({ days: 1, minutes: offset });
    const yesterdayWindowEndDT = romeNow.minus({ days: 1 }).plus({ minutes: offset });

    const yesterdayWindowStart = `${yesterdayWindowStartDT.hour + 24}:${yesterdayWindowStartDT.minute.toString().padStart(2, '0')}:${yesterdayWindowStartDT.second.toString().padStart(2, '0')}`;
    const yesterdayWindowEnd = `${yesterdayWindowEndDT.hour + 24}:${yesterdayWindowEndDT.minute.toString().padStart(2, '0')}:${yesterdayWindowEndDT.second.toString().padStart(2, '0')}`;
    const todayWindowStart = romeNow.minus({ minutes: offset }).toFormat('HH:mm:ss');
    const todayWindowEnd = romeNow.plus({ minutes: offset }).toFormat('HH:mm:ss');

    const query = `
        WITH selected_version AS (
            SELECT id AS gtfs_version_id
            FROM gtfs_versions
            WHERE active = TRUE
            ORDER BY import_date DESC
            LIMIT 1
        ),
        stop AS (
            SELECT stop_id
            FROM stops_data s
            JOIN stops_versions sv ON s.hash = sv.stop_hash
            JOIN selected_version v ON sv.gtfs_version_id = v.gtfs_version_id
            WHERE ${stopsCode}
        ),
        services_today AS (
            SELECT cd.service_id
            FROM calendar_dates_data cd
            JOIN calendar_dates_versions cdv ON cd.hash = cdv.calendar_date_hash
            JOIN selected_version v ON cdv.gtfs_version_id = v.gtfs_version_id
            WHERE cd.date = '${todayDate}' AND cd.exception_type = 1
        ),
        services_yesterday AS (
            SELECT cd.service_id
            FROM calendar_dates_data cd
            JOIN calendar_dates_versions cdv ON cd.hash = cdv.calendar_date_hash
            JOIN selected_version v ON cdv.gtfs_version_id = v.gtfs_version_id
            WHERE cd.date = '${yesterdayDate}' AND cd.exception_type = 1
        ),
        trips_today AS (
            SELECT t.trip_id
            FROM trips_data t
            JOIN trips_versions tv ON t.hash = tv.trip_hash
            JOIN selected_version v ON tv.gtfs_version_id = v.gtfs_version_id
            WHERE t.service_id IN (SELECT service_id FROM services_today)
        ),
        trips_yesterday AS (
            SELECT t.trip_id
            FROM trips_data t
            JOIN trips_versions tv ON t.hash = tv.trip_hash
            JOIN selected_version v ON tv.gtfs_version_id = v.gtfs_version_id
            WHERE t.service_id IN (SELECT service_id FROM services_yesterday)
        )
        -- UNION: prima i passaggi del giorno stesso tra 00:35-00:45
        SELECT DISTINCT std.trip_id, std.arrival_time, std.departure_time, std.stop_sequence, '${todayDate.replaceAll('-', '')}' AS start_date
        FROM stop_times_data std
        JOIN stop_times_versions stv ON std.hash = stv.stop_time_hash
        JOIN selected_version v ON stv.gtfs_version_id = v.gtfs_version_id
        JOIN stop s ON std.stop_id = s.stop_id
        WHERE std.trip_id IN (SELECT trip_id FROM trips_today)
        AND (
            std.arrival_time BETWEEN '${todayWindowStart}' AND '${todayWindowEnd}'
            OR std.departure_time BETWEEN '${todayWindowStart}' AND '${todayWindowEnd}'
        )
        UNION ALL
        -- Poi i passaggi "notturni" del giorno precedente tra 24:35-24:45
        SELECT DISTINCT std.trip_id, std.arrival_time, std.departure_time, std.stop_sequence, '${yesterdayDate.replaceAll('-', '')}' AS start_date
        FROM stop_times_data std
        JOIN stop_times_versions stv ON std.hash = stv.stop_time_hash
        JOIN selected_version v ON stv.gtfs_version_id = v.gtfs_version_id
        JOIN stop s ON std.stop_id = s.stop_id
        WHERE std.trip_id IN (SELECT trip_id FROM trips_yesterday)
        AND (
            std.arrival_time BETWEEN '${yesterdayWindowStart}' AND '${yesterdayWindowEnd}'
            OR std.departure_time BETWEEN '${yesterdayWindowStart}' AND '${yesterdayWindowEnd}'
        )
        ORDER BY arrival_time;
    `;

    const result = await pg.query(query);
    return result.rows || []; // Ritorna un array vuoto se non ci sono risultati
}


module.exports = getTripsByStops;
