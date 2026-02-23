using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class Runs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "hunts_player");

            migrationBuilder.DropTable(
                name: "hunts");

            migrationBuilder.CreateTable(
                name: "runs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    owner_id = table.Column<int>(type: "integer", nullable: false),
                    duration_seconds = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    events = table.Column<string>(type: "jsonb", nullable: true),
                    record = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_runs", x => x.id);
                    table.ForeignKey(
                        name: "fk_runs_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_seasons_owner_id",
                table: "seasons",
                column: "owner_id");

            migrationBuilder.CreateIndex(
                name: "ix_runs_owner_id",
                table: "runs",
                column: "owner_id");

            migrationBuilder.AddForeignKey(
                name: "fk_seasons_users_owner_id",
                table: "seasons",
                column: "owner_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_seasons_users_owner_id",
                table: "seasons");

            migrationBuilder.DropTable(
                name: "runs");

            migrationBuilder.DropIndex(
                name: "ix_seasons_owner_id",
                table: "seasons");

            migrationBuilder.CreateTable(
                name: "hunts",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    desc = table.Column<string>(type: "text", nullable: false),
                    end_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    prizes = table.Column<string>(type: "jsonb", nullable: false),
                    scoring = table.Column<string>(type: "jsonb", nullable: false),
                    seed = table.Column<string>(type: "text", nullable: false),
                    start_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_by = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_hunts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "hunts_player",
                columns: table => new
                {
                    hunt_id = table.Column<int>(type: "integer", nullable: false),
                    player_id = table.Column<string>(type: "text", nullable: false),
                    deaths = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    relogs = table.Column<int>(type: "integer", nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    stream = table.Column<string>(type: "text", nullable: false),
                    trophies = table.Column<string[]>(type: "text[]", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_hunts_player", x => new { x.hunt_id, x.player_id });
                    table.ForeignKey(
                        name: "fk_hunts_player_hunts_hunt_id",
                        column: x => x.hunt_id,
                        principalTable: "hunts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
        }
    }
}
