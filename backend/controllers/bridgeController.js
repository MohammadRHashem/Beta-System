const axios = require('axios');

const BRIDGE_API_URL = process.env.BRIDGE_API_URL;
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

exports.triggerPartnerConfirmation = async (req, res) => {
    // The frontend sends 'correlation_id', the bridge expects 'correlation_id'
    const { correlation_id } = req.body;

    if (!correlation_id) {
        return res.status(400).json({ message: 'Correlation ID is required.' });
    }
    if (!BRIDGE_API_URL || !BRIDGE_API_KEY) {
        console.error('[BRIDGE-CONTROLLER] Bridge API is not configured on the server.');
        return res.status(500).json({ message: 'Bridge API is not configured on the server.' });
    }

    try {
        console.log(`[BRIDGE-CONTROLLER] Relaying manual confirmation for Correlation ID: ${correlation_id}`);
        const response = await axios.post(
            `${BRIDGE_API_URL}/webhook/trigger`,
            { correlation_id }, // The bridge's trigger endpoint expects 'correlation_id'
            {
                headers: {
                    'api-key': BRIDGE_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // 15-second timeout
            }
        );

        res.status(200).json(response.data);

    } catch (error) {
        console.error('[BRIDGE-CONTROLLER] Error calling bridge trigger endpoint:', error.response?.data || error.message);
        const status = error.response?.status || 502;
        const message = error.response?.data?.message || 'Failed to communicate with the payment bridge.';
        res.status(status).json({ message });
    }
};