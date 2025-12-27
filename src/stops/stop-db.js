const { pg } = require("../config/postgres");

async function getStopByNodes(nodes){
    if (!Array.isArray(nodes) || nodes.length < 2) {
        return []; // Ritorna un array vuoto se i nodi non sono validi
    }

    let conditions = '';

    for (let i = 0; i < nodes.length - 1; i++) {
    conditions += `(sd.node_a = ${nodes[i]} AND sd.node_b = ${nodes[i + 1]}) OR `;
    if (i + 2 < nodes.length) {
        conditions += `(sd.node_a = ${nodes[i + 1]} AND sd.node_b = ${nodes[i + 2]}) OR `;
    }
    }

    // Rimuove l'ultimo OR
    conditions = conditions.slice(0, -4);

    const query = `
        SELECT sd.*
        FROM stops_versions sv
        JOIN stops_data sd ON sv.stop_hash = sd.hash
        WHERE sv.gtfs_version_id = (
            SELECT id FROM gtfs_versions WHERE active = TRUE ORDER BY import_date DESC LIMIT 1
        )
        AND (
            ${conditions}
        );
    `;

    const result = await pg.query(query);
    return result.rows || []; // Ritorna un array vuoto se non ci sono risultati
}


module.exports = getStopByNodes;
