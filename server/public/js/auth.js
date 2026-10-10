// Verifica se já está logado ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
    const usuario = localStorage.getItem("usuario_logado");
    if (usuario && obterTokenAdmin()) {
        atualizarInterfaceLogada(true);
    } else {
        // Sem token não existe sessão válida: limpa restos de login antigo
        localStorage.removeItem("usuario_logado");
    }
});

// Token de sessão devolvido pelo servidor no login
function obterTokenAdmin() {
    return localStorage.getItem("admin_token");
}

function abrirLogin() {
    document.getElementById("loginModal").style.display = "block";
}

function fecharLogin() {
    document.getElementById("loginModal").style.display = "none";
}

async function fazerLogin() {
    const loginInput = document.getElementById("loginUser").value;
    const senhaInput = document.getElementById("loginPass").value;

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: loginInput, senha: senhaInput })
        });

        const data = await response.json();
        if (data.ok) {
            localStorage.setItem("usuario_logado", data.usuario);
            localStorage.setItem("admin_token", data.token);
            atualizarInterfaceLogada(true);
            fecharLogin();
            document.getElementById("loginPass").value = "";

            mostrarNotificacao("Login Realizado", "Bem-vindo, " + data.usuario + "!", "sucesso", 1500);
        } else {
            mostrarNotificacao("Falha no Login", data.error, "erro");
        }

    } catch (error) {
        console.error(error);
        mostrarNotificacao("Erro", "Não foi possível conectar ao servidor.", "erro");
    }
}

function fazerLogout() {
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("admin_token");
    atualizarInterfaceLogada(false);
    // Fecha o modal de config se estiver aberto
    fecharConfig(); 
    mostrarNotificacao("Sessão Encerrada", "Logout realizado com sucesso.", "info");
}

// Chamada quando o servidor responde 401 (token ausente, inválido ou expirado)
function tratarSessaoExpirada() {
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("admin_token");
    atualizarInterfaceLogada(false);
    if (typeof fecharAdminLocais === "function") {
        document.getElementById("adminLocaisModal").style.display = "none";
    }
    mostrarNotificacao("Sessão expirada", "Faça login novamente para continuar.", "aviso");
}

function atualizarInterfaceLogada(isLogado) {
    const btnLogin = document.getElementById("btnLoginHeader");
    const btnEditar = document.getElementById("btnEditarAdmin");
    
    // Elementos dentro do modal de Configurações
    const areaLogin = document.getElementById("areaLoginConfig");
    const areaLogout = document.getElementById("areaLogoutConfig");
    const lblUser = document.getElementById("lblUsuarioLogado");

    if (isLogado) {
        // Header
        btnLogin.style.display = "none";
        // Grid
        btnEditar.style.display = "flex";
        // Configurações
        areaLogin.style.display = "none";
        areaLogout.style.display = "block";
        lblUser.textContent = localStorage.getItem("usuario_logado");
    } else {
        // Header
        btnLogin.style.display = "block";
        // Grid
        btnEditar.style.display = "none";
        // Configurações
        areaLogin.style.display = "block";
        areaLogout.style.display = "none";
    }
}
