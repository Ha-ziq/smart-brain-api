import bodyParser from 'body-parser';
import express from 'express'
import cors from "cors"
import { Model } from 'clarifai-nodejs';
import knex from 'knex';
import bcrypt from 'bcrypt'
import path, { dirname } from "path";
import { fileURLToPath } from "url";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;

const saltRounds = 10;
console.log("DATABASE_URL:", process.env.DATABASE_URL);
const db = knex({
    client: 'pg',
    connection:{

        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    }
    });
    
    // {
    //     host: '127.0.0.1',
    //     user: 'postgres',
    //     password: 'password123',
    //     database: 'users'
    // }


const app = express();
app.use(bodyParser.json())
app.use(cors());
// app.use(express.static(path.join(__dirname, "dist")));



app.get("/", async (req, res) => {
    console.log("about to query user")
    try {
        const users = await db.select("*").from("users");
        res.json(users);
    } catch (err) {
        res.status(500).json("Error fetching users");
    }
});

app.post("/signin", (req, res) => {
   const {email,password}=req.body;
   db.select('hash','email').from('login')
   .where('email','=',email)
   .then(data=>{

    const isValid=bcrypt.compareSync(password, data[0].hash);
    if(isValid){
        db.select('*').from('users')
        .where('email','=',email)
        .then(user=>{
            res.status(200).json(user[0])
        }).catch(err=>res.status(400).json("unable to get user"))
    }else{
        res.json("wrong credentials")
    }
   })
   .catch(err=>res.status(400).json("wrong credentialssss"))
})

app.post("/register", (req, res) => {
    const { name, email, password } = req.body
    if(!name || ! email || !password){
        return res.status(400).json("empty field error")
    }    
    const hash = bcrypt.hashSync(password, saltRounds);
    db.transaction(trx => {
        trx.insert({
            hash: hash,
            email: email
        })
            .into('login')
            .returning('email')
            .then(loginEmail => {
                return trx('users')
                    .returning('*')
                    .insert({
                        email: loginEmail[0].email,
                        name: name,
                        joined: new Date()
                    })
                    .then(user => {
                        res.json(user[0]);
                    })
            })
            .then(trx.commit)
            .catch(trx.rollback)      
        })
        .catch(err => { res.status(400).json("connot register") })
    })
    
app.get("/profile/:id", (req, res) => {
    const { id } = req.params;
    db.select('*').from('users').where({ id })
        .then(user => {
            if (user.length) {
                res.json(user[0])
            } else {
                res.status(400).json("error getting user")
            }
        })


})

app.put("/image", (req, res) => {
    const { id } = req.body;
    db('users').where('id', '=', id)
        .increment('entries', 1)
        .returning('entries')
        .then(entries => {
            res.json(entries[0])
        })
        .catch(err => {
            res.status(400).json("unable to get entries")
        })
})

// ----- Clarifai SDK setup -----
const MODEL_URL = "https://clarifai.com/clarifai/main/models/face-detection";
const PAT = "63922679542b42c891df8ee659e57f7f"; // replace with your PAT

const detectorModel = new Model({
    url: MODEL_URL,
    authConfig: { pat: PAT },
});

// ----- Helper function to extract face boxes -----
function extractFaceBoxes(prediction) {
    const regions = prediction?.[0]?.data?.regionsList;
    if (!regions) return [];

    return regions.map(region => {
        const box = region.regionInfo?.boundingBox;
        return {
            topRow: box?.topRow ?? 0,
            leftCol: box?.leftCol ?? 0,
            bottomRow: box?.bottomRow ?? 0,
            rightCol: box?.rightCol ?? 0
        };
    });
}

// ----- API route -----
app.post("/face-detect", async (req, res) => {
    const { imageUrl } = req.body;

    if (!imageUrl) return res.status(400).json({ error: "No image URL provided" });

    try {
        // Call Clarifai SDK
        const prediction = await detectorModel.predictByUrl({
            url: imageUrl,
            inputType: "image",
        });

        // Extract bounding boxes
        const boxes = extractFaceBoxes(prediction);

        res.json({ boxes });
    } catch (err) {
        console.error("Clarifai API error:", err);
        res.status(500).json({ error: "Face detection failed" });
    }
});


// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "dist", "index.html"));
// });

app.listen(PORT, () => {
    console.log(`App is running on port ${PORT}`);
});