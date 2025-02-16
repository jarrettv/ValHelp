using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class UserAlts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "alt_name",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "steam_id",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "alt_name",
                table: "users");

            migrationBuilder.DropColumn(
                name: "steam_id",
                table: "users");
        }
    }
}
