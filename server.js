const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const XLSX = require("xlsx");
const path = require("path");

const app = express();
const PORT = 3000;

// ============================
// 1. CONFIGURAÇÕES
// ============================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const EXCEL_PATH = path.join(__dirname, "CATMAT.xlsx");
const JSON_PATH = path.join(__dirname, "catmat.json");

// ============================
// 2. CONVERTER EXCEL → JSON
// ============================
function converterExcelParaJSON() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("Arquivo CATMAT.xlsx não encontrado!");
    process.exit(1);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  const catmatList = data.map(item => ({
    codigo: item["Código do Item"] || item["codigo"] || "",
    descricao: item["Descrição do Item"] || item["descricao"] || ""
  }));

  fs.writeFileSync(JSON_PATH, JSON.stringify(catmatList, null, 2));
  console.log("Arquivo catmat.json gerado com sucesso.");
}

converterExcelParaJSON();

const CATMAT = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

// ============================
// 3. ROTAS
// ============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// Rota para obter os primeiros 100 itens (exemplo para preencher combo)
app.get("/itens", (req, res) => {
  res.json(CATMAT.slice(0, 100));
});

// Rota para buscar por descrição ou código
app.get("/buscar", (req, res) => {
  const termo = (req.query.q || "").toLowerCase();

  if (!termo || termo.length < 3) {
    return res.status(400).json({ erro: "Informe pelo menos 3 caracteres para busca." });
  }

  const resultados = CATMAT.filter(item =>
    item.codigo?.toString().includes(termo) ||
    item.descricao?.toLowerCase().includes(termo)
  );

  res.json(resultados.slice(0, 50));
});

// Rota para buscar todos os preços do item
app.get("/preco/:codigo", async (req, res) => {
  const codigoItemCatalogo = req.params.codigo;
  const API_URL = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial";
  const TOKEN = "3db72f4ebfecf6ba8ce3c867270fd86d"; // Em produção, use variável de ambiente

  try {
    const response = await axios.get(API_URL, {
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "*/*"
      },
      params: {
        tamanhoPagina: 10,
        codigoItemCatalogo
      }
    });

    const resultados = response.data.resultado || [];

    if (resultados.length === 0) {
      return res.status(404).json({ erro: "Nenhum preço encontrado para o item informado." });
    }

    const precos = resultados.map(r => ({
      precoUnitario: r.precoUnitario || 0,
      nomeUnidadeFornecimento: r.nomeUnidadeFornecimento || 0,
      marca: r.marca || 0,
      estado: r.estado || 0
      
    }));

    // Exibir os preços no console
    //console.log(precos);


    res.json(precos);
  } catch (error) {
    console.error("Erro ao consultar API:", error.message);
    res.status(500).json({ erro: "Erro ao consultar a API externa." });
  }
});

// ============================
// 4. INICIAR SERVIDOR
// ============================
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
