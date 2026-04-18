const {
    predictCrowdSurge,
    askGemini,
    countPeopleInImage,
    translateText,
    uploadIncidentToStorage,
    exportToBigQuery
} = require('../src/services/gcp');

jest.mock('@google-cloud/vertexai', () => ({
    VertexAI: jest.fn().mockImplementation(() => ({
        preview: {
            getGenerativeModel: () => ({
                generateContent: jest.fn().mockResolvedValue({
                    response: { candidates: [{ content: { parts: [{ text: "Mocked prediction" }] } }] }
                })
            })
        }
    }))
}));

jest.mock('@google-cloud/vision', () => ({
    ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
        annotateImage: jest.fn().mockResolvedValue([{
            localizedObjectAnnotations: [{ name: 'Person' }, { name: 'Dog' }, { name: 'Person' }]
        }])
    }))
}));

jest.mock('@google-cloud/translate', () => ({
    v2: {
        Translate: jest.fn().mockImplementation(() => ({
            translate: jest.fn().mockResolvedValue([['Hola'], {}])
        }))
    }
}));

jest.mock('@google-cloud/storage', () => ({
    Storage: jest.fn().mockImplementation(() => ({
        bucket: () => ({
            file: () => ({
                save: jest.fn().mockResolvedValue()
            })
        })
    }))
}));

jest.mock('@google-cloud/firestore', () => {
    const firestoreMock = {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        set: jest.fn().mockResolvedValue(),
        add: jest.fn().mockResolvedValue()
    };
    const fn = jest.fn(() => firestoreMock);
    fn.FieldValue = { serverTimestamp: jest.fn() };
    return { Firestore: fn };
});

jest.mock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => ({
         subscription: () => ({ on: jest.fn() })
    }))
}));

jest.mock('@google-cloud/bigquery', () => ({
    BigQuery: jest.fn().mockImplementation(() => ({
         dataset: () => ({ table: () => ({ insert: jest.fn().mockResolvedValue() }) })
    }))
}));

jest.mock('@google-cloud/logging', () => ({
    Logging: jest.fn().mockImplementation(() => ({
         log: () => ({ entry: jest.fn(), write: jest.fn().mockResolvedValue() })
    }))
}));

describe('GCP Services', () => {
    it('should predict crowd surge', async () => {
        const result = await predictCrowdSurge({ gateA: 20 });
        expect(result).toBe("Mocked prediction");
    });

    it('should ask Gemini', async () => {
        const result = await askGemini('Where is the food?');
        expect(result).toBe("Mocked prediction");
    });

    it('should count people in image', async () => {
        const count = await countPeopleInImage('base64data');
        expect(count).toBe(2);
    });

    it('should translate text', async () => {
        const trans = await translateText('Hello', 'es');
        expect(trans).toBe('Hola');
    });

    it('should upload incident to storage', async () => {
        const url = await uploadIncidentToStorage('base64data', 'Test Incident');
        expect(url).toContain('https://storage.googleapis.com/');
    });

    it('should export to BigQuery', async () => {
        await expect(exportToBigQuery('d', 't', {a:1})).resolves.not.toThrow();
    });
});
