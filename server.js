require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const XLSX = require("xlsx");
const path = require("path");
const e = require("express");

const app = express();
const PORT = process.env.PORT || 3000; // ← Usa o valor do .env ou 3000

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

// Rota do firebase
app.get("/firebase-config", (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});


// Rota paginada e ordenada por descrição
app.get("/itens", (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const itensPorPagina = 100;

  const ordenados = [...CATMAT].sort((a, b) =>
    a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' })
  );

  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const paginaAtual = ordenados.slice(inicio, fim);

  res.json({
    pagina,
    totalPaginas: Math.ceil(CATMAT.length / itensPorPagina),
    totalItens: CATMAT.length,
    resultados: paginaAtual
  });
});

// Rota de busca
app.get("/buscar", (req, res) => {
  const termo = (req.query.q || "").toLowerCase();

  if (!termo || termo.length < 3) {
    return res.status(400).json({ erro: "Informe pelo menos 3 caracteres para busca." });
  }

  const resultadosFiltrados = CATMAT.filter(item =>
    item.codigo?.toString().includes(termo) ||
    item.descricao?.toLowerCase().includes(termo)
  );

  const resultadosOrdenados = resultadosFiltrados.sort((a, b) =>
    a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' })
  );

  res.json(resultadosOrdenados);
});

// Rota de preços com filtro por ano e criterioJulgamento
app.get("/preco/:codigo", async (req, res) => {
  const codigoItemCatalogo = req.params.codigo;
  const anoFiltro = req.query.ano;
  const API_URL = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial";
  const TOKEN = process.env.TOKEN;

  try {
    const response = await axios.get(API_URL, {
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Accept": "*/*"
      },
      params: {
        tamanhoPagina: 100,
        codigoItemCatalogo,
        dataResultado: true
      }
    });

    let resultados = response.data.resultado || [];

    // Filtro por ano (se fornecido)
    if (anoFiltro) {
      resultados = resultados.filter(r => {
        const data = new Date(r.dataCompra);
        return data.getFullYear().toString() === anoFiltro;
      });
    }

    // Filtrar apenas os que possuem criterioJulgamento não vazio
    resultados = resultados.filter(r =>
      r.criterioJulgamento && r.criterioJulgamento.trim() !== ""
    );

    if (resultados.length === 0) {
      return res.status(404).json({ erro: "Nenhum resultado encontrado com critério de julgamento." });
    }

    const formatarReal = valor => `R$ ${valor.toFixed(2).replace('.', ',')}`;

    // Primeiro, cria um array com os dados brutos mantendo o valor numérico do preço
    let precos = resultados.map(r => ({
      precoUnitario: r.precoUnitario || 0, // valor numérico
      nomeOrgao: r.nomeOrgao || "",
      quantidade: r.quantidade || 0,
      nomeUnidadeFornecimento: r.nomeUnidadeFornecimento || "",
      siglaUnidadeMedida: r.siglaUnidadeMedida || "",
      nomeFornecedor: r.nomeFornecedor || "",
      municipio: r.municipio || "",
      estado: r.estado || "",
      dataCompra: r.dataCompra || ""
    }));

    // Ordenar pelo valor numérico do preço unitário (crescente)
    precos.sort((a, b) => a.precoUnitario - b.precoUnitario);

    // Depois de ordenar, formata o preço para o padrão R$
    precos = precos.map(r => ({
      ...r,
      precoUnitario: formatarReal(r.precoUnitario)
    }));

    //console.log(precos);


    const valoresNumericos = resultados
      .map(r => r.precoUnitario)
      .filter(v => typeof v === "number" && !isNaN(v));

    const soma = valoresNumericos.reduce((acc, val) => acc + val, 0);
    const media = valoresNumericos.length ? soma / valoresNumericos.length : 0;

    const valoresOrdenados = [...valoresNumericos].sort((a, b) => a - b);
    let mediana = 0;
    const meio = Math.floor(valoresOrdenados.length / 2);
    if (valoresOrdenados.length % 2 === 0) {
      mediana = (valoresOrdenados[meio - 1] + valoresOrdenados[meio]) / 2;
    } else {
      mediana = valoresOrdenados[meio];
    }

    const minimo = Math.min(...valoresNumericos);
    const maximo = Math.max(...valoresNumericos);

    res.json({
      estatisticas: {
        media: formatarReal(media),
        mediana: formatarReal(mediana),
        minimo: formatarReal(minimo),
        maximo: formatarReal(maximo),
        anoFiltrado: anoFiltro || "Todos"
      },
      dados: precos
    });

  } catch (error) {
    console.error("Erro ao consultar API:", error.message);
    res.status(500).json({ erro: "Erro ao consultar a API externa." });
  }
});

// ============================
// 4. INICIAR SERVIDOR
// ============================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta:${PORT}`);
});
