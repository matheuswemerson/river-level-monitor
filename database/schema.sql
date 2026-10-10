-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 05/12/2025 às 04:57
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `tanque_db`
--

CREATE DATABASE IF NOT EXISTS `tanque_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `tanque_db`;

-- --------------------------------------------------------

--
-- Estrutura para tabela `leituras`
--

CREATE TABLE `leituras` (
  `id` int(11) NOT NULL,
  `nivel` int(11) NOT NULL,
  `local_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `leituras`
--

INSERT INTO `leituras` (`id`, `nivel`, `local_id`, `created_at`) VALUES
(1, 25, 1, '2025-10-16 13:00:00'),
(2, 75, 1, '2025-10-17 14:00:00'),
(3, 50, 1, '2025-10-18 15:00:00'),
(4, 50, 1, '2025-10-19 16:00:00'),
(5, 100, 1, '2025-10-20 17:00:00'),
(6, 70, 1, '2025-10-21 18:00:00'),
(11, 50, 2, '2025-10-29 16:39:17'),
(12, 25, 1, '2025-10-29 16:40:09'),
(13, 75, 1, '2025-12-05 00:12:40'),
(14, 90, 1, '2025-12-05 00:18:48'),
(15, 50, 1, '2025-12-05 00:20:25'),
(16, 25, 1, '2025-12-05 00:20:33'),
(17, 75, 1, '2025-12-05 00:23:53'),
(18, 75, 1, '2025-12-05 00:25:23'),
(19, 100, 1, '2025-12-05 00:33:35'),
(20, 25, 1, '2025-12-05 00:54:25'),
(21, 50, 1, '2025-12-05 00:54:38');

-- --------------------------------------------------------

--
-- Estrutura para tabela `locais`
--

CREATE TABLE `locais` (
  `id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `descricao` text DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `nivel_recomendado` int(11) DEFAULT 80,
  `info_detalhada` text DEFAULT NULL,
  `altura_maxima_historica` varchar(50) DEFAULT 'Não registrado'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `locais`
--

INSERT INTO `locais` (`id`, `nome`, `descricao`, `latitude`, `longitude`, `nivel_recomendado`, `info_detalhada`, `altura_maxima_historica`) VALUES
(1, 'Tanque Principal', 'Ponto de monitoramento principal na área de testes.', -8.13965000, -34.94640000, 80, '', 'Não registrado'),
(2, 'Rio Jaboatão - Ponto A', 'Medição próxima à Ponte na Estrada Eixo da Integração.', -8.15850990, -34.97573300, 80, NULL, 'Não registrado');

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `login` varchar(50) NOT NULL,
  `senha` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `usuarios`
-- Usuário de exemplo: admin / 123456 (senha guardada como hash scrypt).
-- TROQUE a senha: node server/scripts/hash-password.js <nova-senha>
--

INSERT INTO `usuarios` (`id`, `login`, `senha`) VALUES
(1, 'admin', 'scrypt$e83419da3eab7e03f57aad45135bc169$5aef18b9c9f4a31d4110c5a1ca340fe2b9c1a2ba3ff709d10c5cae6b7ae312fcd9528b793d738221680cb45347345cbea070643dd5dc4eee39e9cb7f8c5e02bc');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `leituras`
--
ALTER TABLE `leituras`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_local_id` (`local_id`);

--
-- Índices de tabela `locais`
--
ALTER TABLE `locais`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `login` (`login`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `leituras`
--
ALTER TABLE `leituras`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT de tabela `locais`
--
ALTER TABLE `locais`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `leituras`
--
ALTER TABLE `leituras`
  ADD CONSTRAINT `fk_local_id` FOREIGN KEY (`local_id`) REFERENCES `locais` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
