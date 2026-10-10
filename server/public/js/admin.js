// Headers das requisições de admin (inclui o token de sessão)
function headersAdmin() {
    return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (obterTokenAdmin() || "")
    };
}

// Função para abrir o modal e carregar a lista
function abrirAdminLocais() {
    document.getElementById("adminLocaisModal").style.display = "block";
    carregarListaAdmin();
    limparFormAdmin();
}

function fecharAdminLocais() {
    document.getElementById("adminLocaisModal").style.display = "none";
    // Recarrega os locais no script principal para atualizar o site
    if (typeof carregarLocais === "function") {
        carregarLocais(); 
    }
}

// Carrega a lista de locais para edição
async function carregarListaAdmin() {
    const lista = document.getElementById("adminListaLocais");
    lista.innerHTML = "Carregando...";

    try {
        const response = await fetch("/api/locais");
        const locais = await response.json();
        
        lista.innerHTML = "";
        locais.forEach(local => {
            const li = document.createElement("li");
            li.className = "item-admin";

            // textContent evita que nomes com caracteres especiais quebrem o HTML
            const info = document.createElement("span");
            const nome = document.createElement("strong");
            nome.textContent = local.nome;
            info.append(nome, ` (ID: ${local.id})`);

            const botoes = document.createElement("div");

            const btnEditar = document.createElement("button");
            btnEditar.className = "btn-small";
            btnEditar.style.background = "#ffb300";
            btnEditar.textContent = "Editar";
            btnEditar.addEventListener("click", () => preencherFormAdmin(local));

            const btnExcluir = document.createElement("button");
            btnExcluir.className = "btn-small";
            btnExcluir.style.background = "#e53935";
            btnExcluir.textContent = "Excluir";
            btnExcluir.addEventListener("click", () => deletarLocal(local.id));

            botoes.append(btnEditar, btnExcluir);
            li.append(info, botoes);
            lista.appendChild(li);
        });
    } catch (error) {
        console.error(error);
        lista.innerHTML = "Erro ao carregar locais.";
    }
}

// Preenche o formulário para edição
function preencherFormAdmin(local) {
    document.getElementById("adminIdLocal").value = local.id;
    document.getElementById("adminNome").value = local.nome;
    document.getElementById("adminDescricao").value = local.descricao || "";
    document.getElementById("adminLat").value = local.latitude;
    document.getElementById("adminLon").value = local.longitude;
    
    // NOVOS CAMPOS
    document.getElementById("adminNivelRec").value = local.nivel_recomendado || 80;
    document.getElementById("adminAlturaHist").value = local.altura_maxima_historica || "";
    document.getElementById("adminInfoDet").value = local.info_detalhada || "";
}

function limparFormAdmin() {
    document.getElementById("adminIdLocal").value = "";
    document.getElementById("adminNome").value = "";
    document.getElementById("adminDescricao").value = "";
    document.getElementById("adminLat").value = "";
    document.getElementById("adminLon").value = "";
    // NOVOS CAMPOS
    document.getElementById("adminNivelRec").value = "";
    document.getElementById("adminAlturaHist").value = "";
    document.getElementById("adminInfoDet").value = "";
}

async function salvarLocal() {
    const id = document.getElementById("adminIdLocal").value;
    const dados = {
        nome: document.getElementById("adminNome").value,
        descricao: document.getElementById("adminDescricao").value,
        latitude: document.getElementById("adminLat").value,
        longitude: document.getElementById("adminLon").value,
        // NOVOS DADOS
        nivel_recomendado: document.getElementById("adminNivelRec").value,
        info_detalhada: document.getElementById("adminInfoDet").value,
        altura_maxima_historica: document.getElementById("adminAlturaHist").value
    };

    if (!dados.nome || !dados.latitude || !dados.longitude) {
        alert("Preencha Nome, Latitude e Longitude.");
        return;
    }

    const url = id ? `/api/admin/locais/${id}` : "/api/admin/locais";
    const method = id ? "PUT" : "POST";

    try {
        const response = await fetch(url, {
            method: method,
            headers: headersAdmin(),
            body: JSON.stringify(dados)
        });

        if (response.status === 401) {
            tratarSessaoExpirada();
            return;
        }
        
        if (response.ok) {
            mostrarNotificacao("Sucesso", "Local salvo com sucesso!", "sucesso");
            limparFormAdmin();
            carregarListaAdmin();
        } else {
            // O servidor devolve a mensagem de validação em { error }
            const erro = await response.json().catch(() => ({}));
            mostrarNotificacao("Erro ao salvar", erro.error || "Verifique os dados.", "erro");
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacao("Erro", "Erro na requisição.", "erro");
    }
}

// Deleta um local
async function deletarLocal(id) {
    if (!confirm("Tem certeza? Isso apagará o local e TODO o histórico de leituras dele.")) return;

    try {
        const response = await fetch(`/api/admin/locais/${id}`, {
            method: "DELETE",
            headers: headersAdmin()
        });

        if (response.status === 401) {
            tratarSessaoExpirada();
            return;
        }

        if (response.ok) {
            mostrarNotificacao("Sucesso", "Local excluído.", "sucesso");
            carregarListaAdmin();
        } else {
            mostrarNotificacao("Erro", "Erro ao excluir local.", "erro");
        }
    } catch (error) {
        console.error(error);
        mostrarNotificacao("Erro", "Erro na requisição.", "erro");
    }
}
