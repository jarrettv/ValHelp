using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class Seasons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "obs_secret_code",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "rates",
                table: "scorings",
                type: "jsonb",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "season_code",
                table: "events",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "seasons",
                columns: table => new
                {
                    code = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    pitch = table.Column<string>(type: "text", nullable: false),
                    mode = table.Column<string>(type: "text", nullable: false),
                    desc = table.Column<string>(type: "text", nullable: false),
                    hours = table.Column<float>(type: "real", nullable: false),
                    owner_id = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_by = table.Column<string>(type: "text", nullable: false),
                    admins = table.Column<string>(type: "jsonb", nullable: true),
                    schedule = table.Column<string>(type: "jsonb", nullable: false),
                    score_items = table.Column<string>(type: "jsonb", nullable: true),
                    stats = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_seasons", x => x.code);
                });

            migrationBuilder.CreateIndex(
                name: "ix_events_season_code",
                table: "events",
                column: "season_code");

            migrationBuilder.AddForeignKey(
                name: "fk_events_seasons_season_code",
                table: "events",
                column: "season_code",
                principalTable: "seasons",
                principalColumn: "code");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_events_seasons_season_code",
                table: "events");

            migrationBuilder.DropTable(
                name: "seasons");

            migrationBuilder.DropIndex(
                name: "ix_events_season_code",
                table: "events");

            migrationBuilder.DropColumn(
                name: "obs_secret_code",
                table: "users");

            migrationBuilder.DropColumn(
                name: "season_code",
                table: "events");

            migrationBuilder.AlterColumn<string>(
                name: "rates",
                table: "scorings",
                type: "jsonb",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "jsonb");
        }
    }
}
