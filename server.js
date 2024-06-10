require("dotenv").config();
//require packages
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require('ejs');
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

const uri = process.env.MONGO_URI
const client = new MongoClient(uri);

const hf_token = process.env.HF_TOKEN
const embedding_url = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2";


async function generate_embedding(text) {
    try {
        const response = await axios.post(embedding_url, {
            inputs: text
        }, {
            headers: {
                Authorization: `Bearer ${hf_token}`
            }
        });
        
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(`Request failed with status code ${error.response.status}: ${error.response.data}`);
        } else {
            throw new Error(`Request failed: ${error.message}`);
        }
    }
}
//call thhis function to create embedding for description 
async function createEmbeddings() {
    try {
        await client.connect();
        const database = client.db('sample_hscode'); // Your database name
        const collection = database.collection('hscodes'); // Your collection name

        const cursor = collection.find({ 'description': { "$exists": true } }).limit(50);
        
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const embedding = await generate_embedding(doc.description);
            doc.description_embedding_hf = embedding;
            await collection.replaceOne({ '_id': doc._id }, doc);
        }
    } catch (error) {
        console.error(error);
    } finally {
        await client.close();
    }
}


app.get("/",(req,res) => {
    res.sendFile(__dirname + "/index.html");
    // res.render('index');
})
app.post('/search', async (req, res) => {
    const query = req.body.searchInput;

    try {
        await client.connect();
        const database = client.db('sample_hscode');
        const collection = database.collection('hscodes');

        // const results = await Hscode.aggregate([
            const results = await collection.aggregate([
            { $vectorSearch: {
                queryVector: await generate_embedding(query),
                path: "description_embedding_hf",
                numCandidates: 100,
                limit: 10,
                index: "DescriptionSemanticSearch"
            }},
            {
          
              "$project": {
                "_id":0,
                "hscode":1,
                "description":1,
                "score": { "$meta": "vectorSearchScore" }
              }
          
            }
        ]).toArray();

        res.send(results);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    } finally {
        await client.close();
    }
});
app.post('/searchMovie', async (req, res) => {
    const query = req.body.searchInput;

    try {
        await client.connect();
        const database = client.db('sample_mflix');
        const collection = database.collection('movies');

        // const results = await Hscode.aggregate([
            const results = await collection.aggregate([
            { $vectorSearch: {
                queryVector: await generate_embedding(query),
                path: "plot_embedding_hf",
                numCandidates: 100,
                limit: 10,
                index: "PlotSemanticSearch"
            }}
        ]).toArray();

        res.send(results);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    } finally {
        await client.close();
    }
});


app.listen(process.env.PORT,function(){
    // 3000
    console.log("server is running on" + process.env.PORT);
})
// Call createEmbeddings function to create embeddings
// createEmbeddings();